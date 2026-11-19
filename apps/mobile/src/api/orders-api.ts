import {
  cancelOrder,
  cancelOrderLate,
  createCardIntent,
  createOrder,
  getOrder,
  getOrderPayment,
  listOrders,
  reportOrderNotReceived,
  requestOrderCancel,
  type CancelRequest,
  type CardIntent,
  type CardIntentRequest,
  type CreateOrderRequest,
  type Order,
  type OrderPage,
  type OrderPayment,
} from '@webag/shared';
import { request } from './http';

/**
 * Pedido e pagamento (`/v1/orders*`, ADR-002). O app nunca envia valor: o servidor recalcula tudo (RN-05). O status do pagamento
 * só muda por webhook assinado do provedor: aqui só LEMOS (`getOrderPayment`), nunca "confirmamos" nada (SEC-035).
 */
export type OrderScope = 'active' | 'past';

/** `idempotencyKey` é obrigatória: repetir em rede ruim devolve o MESMO pedido, sem nova reserva nem nova cobrança. */
export const placeOrder = (body: CreateOrderRequest, idempotencyKey: string): Promise<Order> =>
  request((init) => createOrder(body, init), { idempotencyKey });

export const fetchOrders = (scope: OrderScope, cursor?: string | null, signal?: AbortSignal): Promise<OrderPage> =>
  request((init) => listOrders({ scope, limit: 20, ...(cursor ? { cursor } : {}) }, init), { retry: true, ...(signal ? { signal } : {}) });

export const fetchOrder = (orderId: string, signal?: AbortSignal): Promise<Order> =>
  request((init) => getOrder(orderId, init), { retry: true, ...(signal ? { signal } : {}) });

export const fetchOrderPayment = (orderId: string, signal?: AbortSignal): Promise<OrderPayment> =>
  request((init) => getOrderPayment(orderId, init), { retry: true, ...(signal ? { signal } : {}) });

/** Idempotente no servidor: cancelar de novo devolve 200 com o mesmo pedido. */
export const cancelMyOrder = (orderId: string, reason?: string): Promise<Order> =>
  request((init) => cancelOrder(orderId, reason ? { reason } : {}, init), { retry: true });

/**
 * Cartão pela página segura (B.2): o app NUNCA toca em dado de cartão. Pede a intenção (o que quer comprar e o total que viu,
 * SEC-147) e abre `url` no navegador do sistema. Sem `retry`: cada tentativa é uma intenção nova de uso único.
 */
export const startCardIntent = (body: CardIntentRequest): Promise<CardIntent> => request((init) => createCardIntent(body, init));

/** "Não recebi meu pedido": avisa a operação (não estorna nem muda o estado). Idempotente; vale com o pedido a caminho ou até 48 h depois de entregue. */
export const reportNotReceived = (orderId: string) => request((init) => reportOrderNotReceived(orderId, init), { retry: true });

/**
 * Pedido de cancelamento com o pedido em separação (BUG-015): a loja decide e, sem resposta, o admin. Idempotente: pedir de novo devolve
 * a mesma solicitação. O andamento vem em `Order.cancelRequest`.
 */
export const askOrderCancel = (orderId: string, reason?: string): Promise<CancelRequest> =>
  request((init) => requestOrderCancel(orderId, reason ? { reason } : {}, init), { retry: true });

/**
 * Cancelar sem custo por atraso da entrega (WB-253, RN-19 4d). Antes de sair da loja cancela na hora; em saída abre o pedido à operação
 * (`Order.delay.cancelRequest`). Idempotente (toque duplo: um só efeito). Devolve o pedido atualizado.
 */
export const cancelOrderForDelay = (orderId: string): Promise<Order> => request((init) => cancelOrderLate(orderId, {}, init), { retry: true });
