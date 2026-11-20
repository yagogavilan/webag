'use client';

import { ArrowLeft, Warning } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, ErrorState, NoAccessState, SkeletonRows, cx, useToast } from '@/components/ui';
import { ACTOR_LABEL, ADMIN_STATUS_LABEL, FEE_STATE_LABEL, RESOLUTION_LABEL, TYPE_LABEL, adminExchangesApi, adminExchangesKeys, canWaiveFee, feeState } from '@/lib/api/admin-exchanges';
import { ApiError } from '@/lib/api/errors';
import { formatCents, formatFullDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './disputes.module.css';

const T = (id: string) => tid('trocas', id);

export function waiveError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para isentar. Nada foi alterado.';
    if (caught.code === 'EXCHANGE_FEE_ALREADY_PAID') return 'A taxa já foi paga. Não dá para isentar.';
    if (caught.code === 'EXCHANGE_PAYMENT_IN_PROGRESS') return 'O cliente está pagando agora. Espere alguns segundos e tente de novo.';
    if (caught.code === 'EXCHANGE_NOT_AWAITING_FEE' || caught.code === 'EXCHANGE_NO_FEE') return 'Esta troca não está mais esperando a taxa. Atualizamos a tela.';
    if (caught.status === 403) return 'Você não tem permissão para isentar taxas.';
  }
  return 'Não foi possível salvar. Nada foi alterado. Tente de novo.';
}

/** AT3: página da troca no admin. Resumo, valores (taxa pendente, paga ou isenta), logística, linha do tempo e "Isentar a taxa". */
export function ExchangeCasePage({ id }: { id: string }) {
  const { canView, canEdit } = useSession();
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const [waiving, setWaiving] = useState(false);
  const query = useQuery({ queryKey: adminExchangesKeys.detail(id), queryFn: () => adminExchangesApi.get(id) });
  if (!canView('disputas')) return <NoAccessState />;

  const back = <Link href={asRoute('/admin/disputas')} className="wb-text-body-strong" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}><ArrowLeft size={20} aria-hidden="true" />Voltar às disputas</Link>;
  if (query.isPending) return <SkeletonRows rows={4} height={96} label="Carregando a troca" />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <div className={s.page}>{back}<p className="wb-text-body" role="alert" data-testid={T('not-found')}>Não encontramos essa troca.</p></div>;
    return <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} testId={T('error')} />;
  }
  const ex = query.data;
  if (!ex) return null;
  const fee = feeState(ex);

  return (
    <div className={s.page}>
      {back}
      <PageHeader title={`Troca ${ex.number}`} description={`Pedido ${ex.orderNumber} · ${TYPE_LABEL[ex.type]}`} action={<Badge tone={ex.status === 'in_mediation' ? 'warning' : 'neutral'}>{ADMIN_STATUS_LABEL[ex.status]}</Badge>} />
      {ex.autoApproved ? <Banner tone="info" testId={T('auto-approved')}>Aprovada automaticamente pelo sistema porque a loja não respondeu no prazo.</Banner> : null}
      {ex.status === 'in_mediation' ? <Banner tone="warning" action={<Link href={asRoute('/admin/disputas')} className="wb-text-body-strong">Decidir na fila</Link>}>Esta troca espera a decisão da Webag.</Banner> : null}
      <div className={s.blocks}>
        <section className={s.block} aria-labelledby="ex-sum" data-testid={T('detail-summary')}>
          <h2 id="ex-sum" className="wb-text-title2">Resumo</h2>
          <dl className={cx('wb-text-body', s.kv)}>
            <dt>Item</dt><dd>{ex.item?.name ?? 'Item do pedido'}{ex.quantity > 1 ? ` (${ex.quantity})` : ''}</dd>
            <dt>Solução pedida</dt><dd>{RESOLUTION_LABEL[ex.resolution]}</dd>
            <dt>Como devolve</dt><dd>{ex.method === 'pickup_at_home' ? 'Coleta em casa' : 'Leva até a loja'}</dd>
            <dt>Aberta em</dt><dd>{formatFullDateTime(ex.createdAt)}</dd>
            <dt>Decidida por</dt><dd>{ex.decidedBy ? ACTOR_LABEL[ex.decidedBy] ?? ex.decidedBy : 'Ainda não decidida'}</dd>
          </dl>
          {ex.description ? <p className={cx('wb-text-body', s.quote)}>{ex.description}</p> : null}
          {ex.decisionReason ? <p className={cx('wb-text-body', s.quote)}><strong>Motivo da decisão:</strong> {ex.decisionReason}</p> : null}
          {ex.photos && ex.photos.length > 0 ? <p className="wb-text-caption" style={{ margin: 0 }}>{ex.photos.length} {ex.photos.length === 1 ? 'foto anexada' : 'fotos anexadas'} pelo cliente.</p> : null}
        </section>

        <section className={s.block} aria-labelledby="ex-val" data-testid={T('detail-values')}>
          <h2 id="ex-val" className="wb-text-title2">Valores</h2>
          <dl className={cx('wb-text-body', s.kv)}>
            <dt>Taxa de coleta e entrega</dt><dd data-testid={T('fee-amount')}>{formatCents(ex.fee.amount)}</dd>
            <dt>Estado da taxa</dt><dd data-testid={T('fee-state')}>{FEE_STATE_LABEL[fee]}</dd>
            <dt>Diferença de preço</dt><dd>{formatCents(ex.difference.amount)}</dd>
            <dt>A pagar pelo cliente</dt><dd>{formatCents(ex.totalDue.amount)}</dd>
            <dt>Reembolso</dt><dd>{formatCents(ex.refund.amount)}</dd>
          </dl>
          {canEdit('disputas') && fee === 'pending' ? (
            <div>
              <Button variant="secondary" onClick={() => setWaiving(true)} disabled={!online || !canWaiveFee(ex)} data-testid={T('waive-fee')}>Isentar a taxa</Button>
              {!canWaiveFee(ex) ? <p className="wb-text-caption" style={{ margin: '8px 0 0' }}>A taxa só pode ser isentada enquanto a troca espera o pagamento.</p> : null}
            </div>
          ) : null}
          {fee === 'paid' ? <p className="wb-text-caption" style={{ margin: 0 }}>A taxa já foi paga e não pode ser isentada por aqui.</p> : null}
        </section>

        <section className={s.block} aria-labelledby="ex-log" data-testid={T('detail-logistics')}>
          <h2 id="ex-log" className="wb-text-title2">Logística</h2>
          {ex.runs && ex.runs.length > 0 ? (
            <ul className={s.timeline}>
              {ex.runs.map((run) => <li key={run.id} className="wb-text-body">{run.kind === 'exchange_pickup' ? 'Coleta com o cliente' : 'Entrega da peça nova'}: {run.status}</li>)}
            </ul>
          ) : (
            <p className="wb-text-body" style={{ margin: 0 }}>{ex.method === 'pickup_at_home' ? 'Nenhuma corrida criada ainda. Ela nasce depois da aprovação e do pagamento da taxa.' : 'Troca na loja: sem corrida.'}</p>
          )}
          {canView('logistica') ? <Link href={asRoute('/admin/logistica')} className="wb-text-body-strong" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }} data-testid={T('see-logistics')}>Ver na Logística</Link> : null}
        </section>
      </div>

      <section className={s.block} aria-labelledby="ex-tl" data-testid={T('timeline')}>
        <h2 id="ex-tl" className="wb-text-title2">Linha do tempo</h2>
        <ol className={s.timeline}>
          {(ex.timeline ?? []).map((entry, index) => (
            <li key={index} className="wb-text-body">
              {formatFullDateTime(entry.at ?? ex.updatedAt)} · {ADMIN_STATUS_LABEL[entry.to as keyof typeof ADMIN_STATUS_LABEL] ?? entry.to} · {ACTOR_LABEL[entry.actor ?? ''] ?? entry.actor}
              {entry.reason ? ` · ${entry.reason}` : ''}
            </li>
          ))}
        </ol>
      </section>

      {waiving ? (
        <ReasonDialog
          title="Isentar a taxa desta troca?"
          description={`O cliente deixa de pagar ${formatCents(ex.fee.amount)}.${ex.difference.amount > 0 ? ' A diferença de preço continua a pagar.' : ' A coleta é liberada na hora.'}`}
          confirmLabel="Isentar a taxa"
          maxReason={160}
          quickReasons={['Falha da coleta anterior', 'Atendimento de reclamação']}
          testIds={{ dialog: T('waive-dialog'), reason: T('waive-reason'), confirm: T('waive-confirm') }}
          onConfirm={async (reason) => {
            try {
              await adminExchangesApi.waiveFee(ex.id, reason);
            } catch (caught) {
              void client.invalidateQueries({ queryKey: adminExchangesKeys.all });
              throw new UserMessageError(waiveError(caught));
            }
            await client.invalidateQueries({ queryKey: adminExchangesKeys.all });
            toast.show('Taxa isentada. Registrado na auditoria.');
          }}
          onClose={() => setWaiving(false)}
        />
      ) : null}
      {ex.status === 'awaiting_fee' && ex.feeDueAt ? <p className="wb-text-caption" style={{ margin: 0 }}><Warning size={16} aria-hidden="true" /> Prazo para o cliente pagar a taxa: {formatFullDateTime(ex.feeDueAt)}.</p> : null}
    </div>
  );
}
