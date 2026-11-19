'use client';

import { ChatCircleText } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, Dialog, RadioCards, SkeletonRows, useToast } from '@/components/ui';
import { adminApi, keys } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { BATCH_HARD_MAX, logisticsApi, logisticsKeys, etaBandText, type AreaBatch, type WhatsappMessage } from '@/lib/api/logistics';
import { formatPhone } from '@/lib/orders/status';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { assignErrorMessage } from './assign-dialog';

const T = (id: string) => tid('logistica', id);

/** Motivo de uma corrida que ficou de fora do lote (a API manda o `code`; o resto do lote segue). */
export function batchFailMessage(code: string): string {
  if (code === 'DELIVERY_ALREADY_ASSIGNED') return 'Outra pessoa já atribuiu esta corrida.';
  if (code === 'COURIER_INACTIVE') return 'Esse motoboy foi desativado.';
  if (code === 'ADDRESS_INCOMPLETE') return 'O endereço do cliente está incompleto. Atribua por fora do lote e confirme com o cliente.';
  return assignErrorMessage(new ApiError({ status: 409, title: code, code })).message;
}

/** Erro do lote inteiro (nada foi atribuído): quantidade, tipo, áreas diferentes, permissão e rede. */
export function batchError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para atribuir. Nada foi alterado.';
    if (caught.code === 'BATCH_DIFFERENT_AREA') return 'O lote precisa ser de pedidos da mesma cidade. Atualizamos a fila.';
    if (caught.code === 'INVALID_BATCH') return caught.detail ?? 'Esse lote não é mais válido. Atualizamos a fila.';
    if (caught.status === 403) return 'Você não tem permissão para despachar.';
  }
  return 'Não foi possível atribuir o lote. Nada foi alterado. Tente de novo.';
}

interface Outcome {
  id: string;
  orderNumber: string | null;
  ok: boolean;
  message?: string;
  whatsapp?: WhatsappMessage | null;
}

/**
 * Lote por área (DEC-053): mesma área, mesmo motoboy, uma ida só. A API atribui corrida a corrida (cada uma com a sua
 * `Idempotency-Key`); aqui o operador escolhe uma vez e o resultado de cada pedido aparece, inclusive o que falhou, sem desfazer os outros.
 */
export function BatchAssignDialog({ batch, onClose }: { batch: AreaBatch; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const couriers = useQuery({ queryKey: [...logisticsKeys.couriers, 'active'], queryFn: () => logisticsApi.couriers({ active: true, limit: 100 }) });
  const [courierId, setCourierId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; outcomes: Outcome[] } | null>(null);
  // O limite do lote é o parâmetro `entrega_lote_max` (padrão 4; no contrato, no máximo 10): o que passar disso fica para o próximo lote.
  const params = useQuery({ queryKey: keys.parameters, queryFn: adminApi.parameters, staleTime: 5 * 60_000 });
  const configured = params.data?.data.find((p) => p.key === 'entrega_lote_max')?.value;
  const max = typeof configured === 'number' && configured >= 2 ? Math.min(configured, BATCH_HARD_MAX) : BATCH_HARD_MAX;
  const rows = batch.rows.slice(0, max);
  const list = [...(couriers.data?.data ?? [])].sort((a, b) => Number(a.busyNow) - Number(b.busyNow) || a.name.localeCompare(b.name, 'pt-BR'));

  async function submit() {
    if (!courierId) return setError('Escolha quem vai buscar.');
    if (!online) return setError('Conecte-se para atribuir. Nada foi alterado.');
    setBusy(true);
    setError(null);
    try {
      const result = await logisticsApi.assignBatch({ deliveryIds: rows.map((row) => row.id), courierId });
      const outcomes: Outcome[] = [];
      for (const row of rows) {
        const failed = result.failed.find((f) => f.deliveryId === row.id);
        if (failed) {
          outcomes.push({ id: row.id, orderNumber: row.orderNumber ?? null, ok: false, message: batchFailMessage(failed.code) });
          continue;
        }
        let whatsapp: WhatsappMessage | null = null;
        try {
          whatsapp = await logisticsApi.whatsapp(row.id);
        } catch {
          whatsapp = null;
        }
        outcomes.push({ id: row.id, orderNumber: row.orderNumber ?? null, ok: true, whatsapp });
      }
      const name = list.find((c) => c.id === courierId)?.name ?? 'o motoboy';
      const okCount = outcomes.filter((o) => o.ok).length;
      toast.show(okCount === outcomes.length ? `${okCount} pedidos atribuídos a ${name}.` : `${okCount} de ${outcomes.length} atribuídos.`);
      setDone({ name, outcomes });
    } catch (caught) {
      setError(batchError(caught));
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: logisticsKeys.all });
    }
  }

  if (done) {
    return (
      <Dialog title={`Lote atribuído a ${done.name}`} onClose={onClose} testId={T('batch-done')} actions={<Button size="lg" variant="secondary" onClick={onClose} data-testid={T('batch-close')}>Fechar</Button>}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {done.outcomes.map((o) => (
            <li key={o.id} data-testid={T(`batch-result-${o.id}`)}>
              <p className="wb-text-body-strong" style={{ margin: 0 }}>#{o.orderNumber ?? ''}: {o.ok ? 'atribuído' : 'não atribuído'}</p>
              {o.ok && o.whatsapp ? (
                <a href={o.whatsapp.link} target="_blank" rel="noopener noreferrer" onClick={() => void logisticsApi.whatsappSent(o.id).catch(() => undefined)} className="wb-text-body-strong" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
                  <ChatCircleText size={24} aria-hidden="true" />
                  Enviar no WhatsApp ({formatPhone(o.whatsapp.courierPhone)})
                </a>
              ) : null}
              {o.ok && !o.whatsapp ? <p className="wb-text-caption" style={{ margin: 0 }}>Atribuído, mas a mensagem não foi montada. Abra o pedido para tentar de novo.</p> : null}
              {!o.ok ? <p className="wb-text-caption" style={{ margin: 0 }}>{o.message}</p> : null}
            </li>
          ))}
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={`Lote em ${batch.label}`}
      onClose={onClose}
      locked={busy}
      testId={T('batch-sheet')}
      actions={
        <>
          <Button size="lg" onClick={() => void submit()} loading={busy} loadingLabel="Atribuindo…" data-testid={T('batch-submit')}>
            Atribuir {rows.length} pedidos
          </Button>
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>O mesmo motoboy leva os {rows.length} pedidos desta área em uma ida.{batch.rows.length > rows.length ? ` Mais ${batch.rows.length - rows.length} ficam para o próximo lote.` : ''}</p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {rows.map((row) => (
          <li key={row.id} className="wb-text-caption">#{row.orderNumber ?? ''} · {row.storeName ?? 'Loja'}{etaBandText(row) ? ` · ${etaBandText(row)}` : ''}</li>
        ))}
      </ul>
      {couriers.isPending ? (
        <SkeletonRows rows={3} height={56} label="Carregando motoboys" />
      ) : couriers.isError ? (
        <Banner tone="danger" action={<Button size="sm" onClick={() => void couriers.refetch()}>Tentar de novo</Button>}>Não conseguimos carregar os motoboys.</Banner>
      ) : list.length === 0 ? (
        <Banner tone="info">Nenhum motoboy cadastrado. Cadastre o primeiro na aba Motoboys para despachar.</Banner>
      ) : (
        <RadioCards legend="Motoboy" name="batch-courier" value={courierId} onChange={setCourierId} options={list.map((courier) => ({ value: courier.id, label: `${courier.name} · ${courier.busyNow ? 'Em corrida' : 'Livre'}`, description: formatPhone(courier.phone), testId: T(`batch-driver-${courier.id}`) }))} />
      )}
      {error ? <Banner tone="danger" testId={T('batch-error')}>{error}</Banner> : null}
    </Dialog>
  );
}
