'use client';

import { ChatCircleText, Eye, Phone } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { Banner, Button, Dialog, OtpInput, RadioCards, SkeletonRows, TextArea, TextField, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { FAIL_REASONS, KIND_LABEL, STATUS_LABEL, logisticsApi, logisticsKeys, type Delivery, type DeliveryDetail, type DeliveryKind, type FailReason } from '@/lib/api/logistics';
import { formatCents, formatFullDateTime } from '@/lib/format';
import { parseCents } from '@/lib/money';
import { formatPhone, whatsappHref } from '@/lib/orders/status';
import { tid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOnline } from '@/lib/use-online';
import { EtaChip, KindBadge, WaitChip } from './logistics-page';
import s from './logistics.module.css';

const T = (id: string) => tid('logistica', id);
type Mode = 'main' | 'delivered' | 'not_delivered' | 'cancel';

function actionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'Conecte-se para atualizar. Nada foi alterado.';
    if (error.code === 'INVALID_DELIVERY_TRANSITION') return 'Esse trabalho mudou de estado. Atualizamos a tela.';
    if (error.code === 'DELIVERY_CODE_LOCKED') return 'Muitos códigos errados. Só o super admin conclui, com justificativa.';
    if (error.status === 422 && error.detail) return error.detail;
    if (error.status === 403) return 'Você não tem permissão para esta ação.';
    if (error.status === 409) return 'Esse trabalho mudou. Atualizamos a tela.';
  }
  return 'Não foi possível salvar. Nada foi alterado. Tente de novo.';
}

/** Detalhe do trabalho (LG2): contatos só enquanto ativo, próximo passo único e "Mais". */
export function DeliveryDialog({ id, canWrite, onClose, onAssign }: { id: string; canWrite: boolean; onClose: () => void; onAssign: (delivery: Delivery) => void }) {
  const query = useQuery({ queryKey: logisticsKeys.detail(id), queryFn: () => logisticsApi.delivery(id), refetchInterval: 15_000 });
  const detail = query.data;
  return (
    <Dialog wide title={detail ? `${detail.orderNumber ? `#${detail.orderNumber}` : 'Trabalho'} · ${KIND_LABEL[detail.kind as DeliveryKind]}` : 'Trabalho'} onClose={onClose} testId={T('detail')} actions={<Button size="lg" variant="secondary" onClick={onClose}>Fechar</Button>}>
      {detail ? <Body detail={detail} canWrite={canWrite} onAssign={onAssign} onClose={onClose} /> : query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? <p className="wb-text-body" role="alert">Não encontramos esse trabalho.</p> : <Banner tone="danger" action={<Button size="sm" onClick={() => void query.refetch()}>Tentar de novo</Button>}>Não conseguimos carregar o trabalho.</Banner>
      ) : <SkeletonRows rows={3} height={72} label="Carregando o trabalho" />}
    </Dialog>
  );
}

function Body({ detail, canWrite, onAssign, onClose }: { detail: DeliveryDetail; canWrite: boolean; onAssign: (delivery: Delivery) => void; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [mode, setMode] = useState<Mode>('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [cost, setCost] = useState('');
  const [failReason, setFailReason] = useState<FailReason | null>(null);
  const [text, setText] = useState('');
  const allowed = new Set<string>(detail.allowedActions);
  const now = useNow(30_000);
  const [revealed, setRevealed] = useState<DeliveryDetail['contact'] | null>(null);
  const [revealing, setRevealing] = useState(false);
  const contact = revealed ?? detail.contact;
  const canReveal = !contact?.customerPhone && detail.contactRevealable === true && !revealed;
  const phoneLink = whatsappHref(contact?.customerPhone ?? null);

  async function run(call: () => Promise<unknown>, success: string, after?: () => void) {
    if (!online) {
      setError('Conecte-se para atualizar. Nada foi alterado.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call();
      toast.show(success);
      after?.();
    } catch (caught) {
      setError(actionError(caught));
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: logisticsKeys.all });
    }
  }

  const step = (() => {
    if (!canWrite) return null;
    if (allowed.has('assign')) return { label: 'Atribuir motoboy', go: () => onAssign(detail), testId: 'assign' };
    if (allowed.has('confirm')) return { label: 'Marcar a caminho da loja', go: () => void run(() => logisticsApi.status(detail.id, { action: 'confirm' }), 'Motoboy a caminho da loja.'), testId: 'next-action' };
    if (allowed.has('picked_up')) return { label: 'Marcar como coletado', go: () => void run(() => logisticsApi.status(detail.id, { action: 'picked_up' }), `Pedido ${detail.orderNumber ?? ''} coletado.`), testId: 'next-action' };
    if (allowed.has('delivered')) return { label: 'Marcar como entregue', go: () => setMode('delivered'), testId: 'next-action' };
    if (allowed.has('return_confirmed')) return { label: 'Confirmar devolução à loja', go: () => void run(() => logisticsApi.status(detail.id, { action: 'return_confirmed' }), 'Devolução registrada.'), testId: 'next-action' };
    if (allowed.has('reattempt')) return { label: 'Tentar de novo', go: () => void run(() => logisticsApi.status(detail.id, { action: 'reattempt' }), 'Voltou para a fila.'), testId: 'next-action' };
    return null;
  })();

  async function confirmDelivered() {
    if (detail.codeRequired && !/^\d{4}$/.test(code)) {
      setError('Digite o código de 4 dígitos que o cliente informou.');
      return;
    }
    const cents = cost.trim() === '' ? null : parseCents(cost);
    if (cost.trim() !== '' && cents === null) {
      setError('Confira o custo da corrida.');
      return;
    }
    await run(
      async () => {
        await logisticsApi.status(detail.id, detail.codeRequired ? { action: 'delivered', code } : { action: 'delivered' });
        if (cents !== null) await logisticsApi.setCost(detail.id, { costCents: cents });
      },
      `Pedido ${detail.orderNumber ?? ''} entregue. O cliente foi avisado.`,
      onClose,
    );
  }

  async function confirmNotDelivered() {
    if (!failReason) {
      setError('Escolha o que aconteceu.');
      return;
    }
    if (failReason === 'other' && text.trim().length < 10) {
      setError('Escreva o motivo (mínimo 10 letras).');
      return;
    }
    await run(() => logisticsApi.status(detail.id, { action: 'not_delivered', failReason, ...(text.trim() ? { reason: text.trim() } : {}) }), 'Registrado. A entrega não foi concluída.', onClose);
  }

  async function confirmCancel() {
    if (text.trim().length < 3) {
      setError('Escreva o motivo do cancelamento.');
      return;
    }
    await run(() => logisticsApi.status(detail.id, { action: 'cancel', reason: text.trim() }), 'Despacho cancelado.', onClose);
  }

  if (mode === 'delivered') {
    return (
      <>
        <p className="wb-text-body" style={{ margin: 0 }}>Isso conclui o pedido {detail.orderNumber ? `#${detail.orderNumber}` : ''} e libera o repasse da loja.</p>
        {detail.codeRequired ? (
          <div>
            <p className="wb-text-caption-strong" style={{ margin: '0 0 8px' }}>Código do cliente</p>
            <OtpInput length={4} value={code} onChange={setCode} label="Código de entrega do cliente" testId={T('delivered-code')} />
          </div>
        ) : null}
        <TextField label="Custo da corrida (opcional agora)" inputMode="decimal" placeholder="6,00" value={cost} onChange={(event) => setCost(event.target.value)} data-testid={T('delivered-cost')} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <div className={s.actions}>
          <Button size="lg" onClick={() => void confirmDelivered()} loading={busy} loadingLabel="Salvando…" data-testid={T('delivered-confirm')}>Marcar como entregue</Button>
          <Button size="lg" variant="secondary" onClick={() => { setMode('main'); setError(null); }} disabled={busy}>Voltar</Button>
        </div>
      </>
    );
  }
  if (mode === 'not_delivered') {
    return (
      <>
        <RadioCards legend="O que aconteceu?" name="fail" value={failReason} onChange={setFailReason} options={FAIL_REASONS.map((reason) => ({ value: reason.id, label: reason.label, testId: T(`reason-${reason.id}`) }))} />
        <TextArea label="Observação (opcional)" value={text} onChange={(event) => setText(event.target.value.slice(0, 140))} counter={{ value: text.length, max: 140 }} rows={2} data-testid={T('reason-text')} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <div className={s.actions}>
          <Button size="lg" variant="destructive" onClick={() => void confirmNotDelivered()} loading={busy} loadingLabel="Registrando…" data-testid={T('notdelivered-submit')}>Registrar não entregue</Button>
          <Button size="lg" variant="secondary" onClick={() => { setMode('main'); setError(null); }} disabled={busy}>Voltar</Button>
        </div>
      </>
    );
  }
  if (mode === 'cancel') {
    return (
      <>
        <p className="wb-text-body" style={{ margin: 0 }}>O trabalho volta para a fila. Avise o motoboy se ele já foi acionado.</p>
        <TextArea label="Motivo" value={text} onChange={(event) => setText(event.target.value.slice(0, 200))} rows={2} data-testid={T('cancel-text')} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <div className={s.actions}>
          <Button size="lg" variant="destructive" onClick={() => void confirmCancel()} loading={busy} loadingLabel="Cancelando…">Cancelar despacho</Button>
          <Button size="lg" variant="secondary" onClick={() => { setMode('main'); setError(null); }} disabled={busy}>Voltar</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={s.rowTop}>
        <span className={`wb-text-caption-strong ${s.wait}`} data-testid={T('status')}>{STATUS_LABEL[detail.status]}</span>
        {detail.status === 'ready_for_collection' ? <WaitChip delivery={detail} /> : <KindBadge kind={detail.kind as DeliveryKind} />}
      </div>
      <EtaChip delivery={detail} now={now} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {step ? (
        <Button size="lg" onClick={step.go} loading={busy} loadingLabel="Atualizando…" data-testid={T(step.testId)}>
          {step.label}
        </Button>
      ) : null}
      {detail.courier?.name ? <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('driver-block')}>Motoboy: <strong>{detail.courier.name}</strong>{detail.whatsappSentAt ? ` · mensagem aberta no WhatsApp às ${formatFullDateTime(detail.whatsappSentAt)}` : ''}</p> : null}
      {contact ? (
        <>
          <section className={s.block} aria-labelledby="lg-store" data-testid={T('store-block')}>
            <h3 id="lg-store" className="wb-text-body-strong">Coletar em</h3>
            <p className="wb-text-body" style={{ margin: 0 }}>{detail.storeName ?? 'Loja'}</p>
            <p className="wb-text-body" style={{ margin: 0 }}>{contact.pickupAddress ?? 'Endereço da loja não informado'}</p>
            {contact.storePhone ? <a href={`tel:${contact.storePhone}`} className="wb-text-body-strong" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minHeight: 44 }} data-testid={T('store-call')}><Phone size={24} aria-hidden="true" />Ligar para {detail.storeName ?? 'a loja'}</a> : null}
          </section>
          <section className={s.block} aria-labelledby="lg-customer" data-testid={T('customer-block')}>
            <h3 id="lg-customer" className="wb-text-body-strong">Entregar para</h3>
            <p className="wb-text-body" style={{ margin: 0 }}>{contact.customerFirstName ?? 'Cliente'}</p>
            <p className="wb-text-body" style={{ margin: 0 }}>{contact.dropoffAddress ?? 'Endereço mascarado'}</p>
            {contact.customerPhone ? (
              <p className="wb-text-body" style={{ margin: 0 }}>
                {formatPhone(contact.customerPhone)}
                {phoneLink ? <> · <a href={phoneLink} target="_blank" rel="noopener noreferrer" className="wb-text-body-strong" data-testid={T('customer-whatsapp')}><ChatCircleText size={20} aria-hidden="true" /> WhatsApp</a></> : null}
              </p>
            ) : null}
            <p className="wb-text-caption" style={{ margin: 0 }}>Dados só para esta entrega.</p>
          </section>
        </>
      ) : (
        <p className="wb-text-caption" style={{ margin: 0 }}>Os dados do cliente só aparecem enquanto o trabalho está ativo.</p>
      )}
      {canReveal ? (
        <section className={s.block} aria-labelledby="lg-reveal" data-testid={T('reveal-block')}>
          <h3 id="lg-reveal" className="wb-text-body-strong">Contato do cliente</h3>
          <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('masked-phone')}>{detail.customerPhoneMasked ?? 'Telefone oculto'}</p>
          <p className="wb-text-caption" style={{ margin: 0 }}>Ver o telefone e o endereço exige um motivo e fica registrado na auditoria.</p>
          <div>
            <Button variant="secondary" size="sm" icon={<Eye size={20} aria-hidden="true" />} onClick={() => setRevealing(true)} disabled={!online} data-testid={T('reveal')}>Revelar contato</Button>
          </div>
        </section>
      ) : null}
      {revealed ? <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('revealed-note')}>Contato revelado agora. Ficou registrado na auditoria.</p> : null}
      {revealing ? (
        <ReasonDialog
          title="Revelar o contato do cliente?"
          description="O motivo e o seu nome ficam na auditoria. O telefone e o endereço não são guardados no registro."
          confirmLabel="Revelar contato"
          quickReasons={['Cliente não atende o motoboy', 'Conferir o endereço de entrega', 'Atendimento de reclamação']}
          testIds={{ dialog: T('reveal-dialog'), reason: T('reveal-reason'), confirm: T('reveal-confirm') }}
          onConfirm={async (reason) => {
            try {
              setRevealed((await logisticsApi.revealContact(detail.id, reason)).contact);
            } catch (caught) {
              if (caught instanceof ApiError && caught.code === 'CONTACT_NOT_AVAILABLE') throw new UserMessageError('O contato já foi apagado: a corrida terminou há mais dias que o prazo de guarda.');
              throw caught;
            }
          }}
          onClose={() => setRevealing(false)}
        />
      ) : null}
      <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('payment-note')}>Pago online. Não cobrar do cliente.</p>
      <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('cost-value')}>
        {detail.volumes} {detail.volumes === 1 ? 'volume' : 'volumes'} · taxa do cliente {formatCents(detail.fee.amount)} · custo previsto {formatCents(detail.expectedCost.amount)}
        {detail.cost ? ` · custo lançado ${formatCents(detail.cost.amount)}` : ''}
      </p>
      {detail.note ? <p className="wb-text-body" style={{ margin: 0 }}>Recado da loja: {detail.note}</p> : null}
      {canWrite && (allowed.has('not_delivered') || allowed.has('cancel') || allowed.has('reassign') || detail.courier?.name) ? (
        <div className={s.actions}>
          {allowed.has('not_delivered') ? <Button variant="secondary" onClick={() => { setMode('not_delivered'); setError(null); }} data-testid={T('not-delivered')}>Não entregue</Button> : null}
          {allowed.has('reassign') ? <Button variant="secondary" onClick={() => onAssign(detail)} data-testid={T('driver-change')}>Trocar motoboy</Button> : null}
          {allowed.has('cancel') ? <Button variant="text" onClick={() => { setMode('cancel'); setText(''); setError(null); }} data-testid={T('cancel-dispatch')}>Cancelar despacho</Button> : null}
        </div>
      ) : null}
      <section aria-labelledby="lg-tl" data-testid={T('timeline')}>
        <h3 id="lg-tl" className="wb-text-body-strong" style={{ margin: '0 0 8px' }}>Andamento</h3>
        <ol className={s.timeline}>
          {(detail.timeline ?? []).map((entry, index) => (
            <li key={entry.id ?? index} className="wb-text-caption">
              {formatFullDateTime(entry.at ?? detail.updatedAt)} · {STATUS_LABEL[entry.to as keyof typeof STATUS_LABEL] ?? entry.to}
              {entry.reason ? ` · ${entry.reason}` : ''}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
