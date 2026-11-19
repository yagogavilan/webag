'use client';

import { ChatCircleText, Copy } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, CheckboxField, Dialog, RadioCards, SkeletonRows, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { logisticsApi, logisticsKeys, type Delivery, type WhatsappMessage } from '@/lib/api/logistics';
import { formatPhone } from '@/lib/orders/status';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './logistics.module.css';

const T = (id: string) => tid('logistica', id);

export function assignErrorMessage(error: unknown): { message: string; needsAddress?: boolean; refresh?: boolean } {
  if (error instanceof ApiError) {
    if (error.isNetwork) return { message: 'Conecte-se para atribuir. Nada foi alterado.' };
    if (error.code === 'DELIVERY_ALREADY_ASSIGNED') return { message: 'Esse trabalho já foi atribuído por outra pessoa. Atualizamos a fila.', refresh: true };
    if (error.code === 'COURIER_INACTIVE') return { message: 'Esse motoboy foi desativado. Escolha outro.', refresh: true };
    if (error.code === 'ADDRESS_INCOMPLETE') return { message: 'O endereço do cliente está incompleto. Confira com o cliente e confirme para seguir.', needsAddress: true };
    if (error.status === 403) return { message: 'Você não tem permissão para despachar.' };
    if (error.status === 409) return { message: 'Esse trabalho mudou. Atualizamos a fila.', refresh: true };
  }
  return { message: 'Não foi possível salvar. Nada foi alterado. Tente de novo.' };
}

/**
 * Atribuir motoboy (LG3). Primeiro operador vence: se outra pessoa atribuiu antes, a API devolve 409 e a fila é relida.
 * Depois de atribuir, o botão "Enviar no WhatsApp" é um link real (wa.me) com a mensagem pronta; abrir o link registra o envio.
 */
export function AssignDialog({ delivery, onClose }: { delivery: Pick<Delivery, 'id' | 'orderNumber' | 'storeName' | 'destination'>; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const couriers = useQuery({ queryKey: [...logisticsKeys.couriers, 'active'], queryFn: () => logisticsApi.couriers({ active: true, limit: 100 }) });
  const [courierId, setCourierId] = useState<string | null>(null);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [needsAddress, setNeedsAddress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; whatsapp: WhatsappMessage | null; failed: boolean } | null>(null);

  const list = [...(couriers.data?.data ?? [])].sort((a, b) => Number(a.busyNow) - Number(b.busyNow) || a.name.localeCompare(b.name, 'pt-BR'));

  async function submit() {
    if (!courierId) {
      setError('Escolha quem vai buscar.');
      return;
    }
    if (!online) {
      setError('Conecte-se para atribuir. Nada foi alterado.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await logisticsApi.assign(delivery.id, { courierId, addressConfirmed: addressConfirmed || undefined });
      const courier = list.find((c) => c.id === courierId);
      let whatsapp: WhatsappMessage | null = null;
      let failed = false;
      try {
        whatsapp = await logisticsApi.whatsapp(delivery.id);
      } catch {
        failed = true;
      }
      setDone({ name: courier?.name ?? 'o motoboy', whatsapp, failed });
      toast.show(`Atribuído a ${courier?.name ?? 'o motoboy'}.`);
    } catch (caught) {
      const info = assignErrorMessage(caught);
      setError(info.message);
      if (info.needsAddress) setNeedsAddress(true);
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: logisticsKeys.all });
    }
  }

  if (done) {
    const { whatsapp } = done;
    return (
      <Dialog title={`Atribuído a ${done.name}`} onClose={onClose} testId={T('assigned-dialog')} actions={<Button size="lg" variant="secondary" onClick={onClose} data-testid={T('assigned-close')}>Fechar</Button>}>
        <Banner tone="success">Agora envie a mensagem para o motoboy.</Banner>
        {whatsapp && whatsapp.courierActiveDeliveries > 1 ? <Banner tone="warning">{done.name} já tem {whatsapp.courierActiveDeliveries} corridas ativas.</Banner> : null}
        {whatsapp ? (
          <>
            <a
              href={whatsapp.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void logisticsApi.whatsappSent(delivery.id).catch(() => undefined)}
              className="wb-text-body-strong"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, padding: '0 24px', borderRadius: 999, background: 'var(--wb-color-action-primary)', color: 'var(--wb-color-text-on-brand)', textDecoration: 'none' }}
              data-testid={T('send-whatsapp')}
            >
              <ChatCircleText size={24} aria-hidden="true" />
              Enviar no WhatsApp
            </a>
            <details>
              <summary className="wb-text-body-strong" style={{ minHeight: 44, cursor: 'pointer' }} data-testid={T('message-preview-toggle')}>Ver mensagem</summary>
              <pre className={s.preview} data-testid={T('message-preview')}>{whatsapp.message}</pre>
            </details>
            <Button variant="secondary" icon={<Copy size={24} aria-hidden="true" />} onClick={() => void navigator.clipboard?.writeText(whatsapp.message).then(() => toast.show('Mensagem copiada.'))} data-testid={T('copy-message')}>
              Copiar mensagem
            </Button>
            <p className="wb-text-caption" style={{ margin: 0 }}>Sem WhatsApp neste aparelho? Copie a mensagem e envie por onde preferir. O telefone do motoboy é {formatPhone(whatsapp.courierPhone)}.</p>
          </>
        ) : (
          <Banner tone="warning">A atribuição foi salva, mas não conseguimos montar a mensagem. Abra o trabalho para tentar de novo.</Banner>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      title={`Quem vai buscar o #${delivery.orderNumber ?? ''}?`}
      onClose={onClose}
      locked={busy}
      testId={T('assign-sheet')}
      actions={
        <>
          <Button size="lg" onClick={() => void submit()} loading={busy} loadingLabel="Atribuindo…" data-testid={T('submit')}>
            Atribuir motoboy
          </Button>
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>
        {delivery.storeName ?? 'Loja'}
        {delivery.destination ? ` > ${delivery.destination}` : ''}
      </p>
      {couriers.isPending ? (
        <SkeletonRows rows={3} height={56} label="Carregando motoboys" />
      ) : couriers.isError ? (
        <Banner tone="danger" action={<Button size="sm" onClick={() => void couriers.refetch()}>Tentar de novo</Button>}>
          Não conseguimos carregar os motoboys.
        </Banner>
      ) : list.length === 0 ? (
        <Banner tone="info" testId={T('no-couriers')}>
          Nenhum motoboy cadastrado. Cadastre o primeiro na aba Motoboys para despachar.
        </Banner>
      ) : (
        <RadioCards
          legend="Motoboy"
          name="courier"
          value={courierId}
          onChange={setCourierId}
          options={list.map((courier) => ({ value: courier.id, label: `${courier.name} · ${courier.busyNow ? 'Em corrida' : 'Livre'}`, description: formatPhone(courier.phone), testId: T(`driver-option-${courier.id}`) }))}
        />
      )}
      {needsAddress ? <CheckboxField label="Confirmei o endereço com o cliente" checked={addressConfirmed} onChange={(event) => setAddressConfirmed(event.target.checked)} data-testid={T('address-confirmed')} /> : null}
      {error ? <Banner tone="danger" testId={T('assign-error')}>{error}</Banner> : null}
    </Dialog>
  );
}
