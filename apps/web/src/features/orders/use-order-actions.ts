'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { ApiError } from '@/lib/api/errors';
import { ordersApi, ordersKeys, type AdvanceExtra, type OrderAdvanceStatus, type StoreOrder, type StoreOrderSummary } from '@/lib/api/orders';
import { asRoute } from '@/lib/routes';

export const OFFLINE_MESSAGE = 'Conecte-se para mudar o status. Nada foi alterado.';

type Result = { ok: true; order: StoreOrder } | { ok: false; message: string };
type OrderRef = Pick<StoreOrderSummary, 'id' | 'number'>;

const ADVANCE_TOAST: Record<OrderAdvanceStatus, (number: string) => string> = {
  in_preparation: (n) => `Pedido ${n} em separação.`,
  ready_for_collection: (n) => `Pedido ${n} pronto para coleta. A logística do Webag foi avisada.`,
  ready_for_pickup: (n) => `Pedido ${n} pronto para retirada.`,
  delivered: (n) => `Pedido ${n} entregue.`,
};

/**
 * Conflito (outro funcionário agiu, o cliente cancelou): relê o pedido e diz o que aconteceu, no tom da spec (P1 C5/C6).
 * A API devolve 409 `INVALID_TRANSITION` sem dizer quem agiu (pendência de contrato): a mensagem usa só o estado atual.
 */
async function conflictMessage(storeId: string, orderId: string): Promise<string> {
  try {
    const current = await ordersApi.get(storeId, orderId);
    if (current.status === 'cancelled') return current.cancellation?.by === 'customer' ? 'Pedido cancelado pelo cliente.' : 'Pedido cancelado.';
    if (current.status === 'refused') return 'Pedido recusado.';
    return 'Esse pedido já foi atualizado por outra pessoa. Atualizamos a tela.';
  } catch {
    return 'Esse pedido já foi atualizado por outra pessoa. Atualizamos a tela.';
  }
}

async function describeError(error: unknown, storeId: string, orderId: string): Promise<string> {
  if (error instanceof ApiError) {
    if (error.isNetwork) return OFFLINE_MESSAGE;
    if (error.code === 'INVALID_TRANSITION' || error.status === 409) return conflictMessage(storeId, orderId);
    if (error.code === 'PICKUP_CODE_INVALID') return 'Código incorreto. Confira o código de 4 dígitos com o cliente.';
    if (error.status === 404) return 'Não encontramos esse pedido.';
    if (error.status === 403) return 'Você não tem permissão para esta ação.';
    if (error.status === 429) return 'Muitas tentativas. Espere um instante e tente de novo.';
    if (error.status === 400 && error.detail) return error.detail;
  }
  return 'Não foi possível concluir. Nada foi alterado. Tente de novo.';
}

/**
 * Ações do lojista sobre um pedido (aceitar, recusar, avançar, cancelar). Cada uma devolve `{ ok, message }` em vez de lançar:
 * o botão que chamou decide onde mostrar o erro. Enquanto um pedido tem ação em andamento, `isBusy` o trava (sem duplo toque).
 */
export function useOrderActions() {
  const { store } = useMerchant();
  const storeId = store.data?.id ?? '';
  const client = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());

  const run = useCallback(
    async (order: OrderRef, call: () => Promise<StoreOrder>, onSuccess: (done: StoreOrder) => void): Promise<Result> => {
      if (inFlight.current.has(order.id)) return { ok: false, message: 'Aguarde: o pedido está sendo atualizado.' };
      inFlight.current.add(order.id);
      setBusy(new Set(inFlight.current));
      try {
        const done = await call();
        onSuccess(done);
        return { ok: true, order: done };
      } catch (error) {
        return { ok: false, message: await describeError(error, storeId, order.id) };
      } finally {
        inFlight.current.delete(order.id);
        setBusy(new Set(inFlight.current));
        // Sucesso ou conflito: a lista volta a refletir o servidor.
        void client.invalidateQueries({ queryKey: ordersKeys.all(storeId) });
      }
    },
    [client, storeId],
  );

  const accept = useCallback(
    (order: OrderRef) =>
      run(order, () => ordersApi.accept(storeId, order.id), () =>
        toast.show(`Pedido ${order.number} aceito.`, { action: { label: 'Imprimir comanda', onAction: () => router.push(asRoute(`/lojista/pedidos/${order.id}/comanda?imprimir=1`)) } }),
      ),
    [run, storeId, toast, router],
  );

  const refuse = useCallback(
    (order: OrderRef, reason: string) => run(order, () => ordersApi.refuse(storeId, order.id, reason), () => toast.show('Pedido recusado. O cliente recebe o valor de volta.')),
    [run, storeId, toast],
  );

  const advance = useCallback(
    (order: OrderRef, to: OrderAdvanceStatus, extra?: AdvanceExtra) => run(order, () => ordersApi.advance(storeId, order.id, to, extra), () => toast.show(ADVANCE_TOAST[to](order.number))),
    [run, storeId, toast],
  );

  const cancel = useCallback(
    (order: OrderRef, reason: string) => run(order, () => ordersApi.cancel(storeId, order.id, reason), () => toast.show(`Pedido ${order.number} cancelado. O cliente recebe o valor de volta.`)),
    [run, storeId, toast],
  );

  return { storeId, accept, refuse, advance, cancel, isBusy: (orderId: string) => busy.has(orderId) };
}
