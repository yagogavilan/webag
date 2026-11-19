import { apiFetch } from '@webag/shared';
import { request } from './http';

/**
 * Só desenvolvimento (DT-065): faz o papel do banco + Mercado Pago no provedor `fake`, pelo MESMO caminho do webhook assinado
 * (o que `pnpm pagar` faz). O app não marca nada como pago: depois da chamada ele só relê o pedido do servidor.
 * Rota por PEDIDO (`/v1/dev/orders/{orderId}/payment/{action}`), porque o app não conhece o id da tentativa de pagamento;
 * ela só existe com `NODE_ENV=development|test` e provedor `fake`. Fora do contrato OpenAPI de propósito.
 */
export type SimulatedOutcome = 'approve' | 'decline' | 'expire';

export const simulatePayment = (orderId: string, outcome: SimulatedOutcome = 'approve'): Promise<unknown> =>
  request((init) =>
    apiFetch<{ data: unknown; status: 200; headers: Headers }>(`/v1/dev/orders/${encodeURIComponent(orderId)}/payment/${outcome}`, {
      ...init,
      method: 'POST',
      headers: { ...(init.headers as Record<string, string>), 'Content-Type': 'application/json' },
      body: '{}',
    }),
  );
