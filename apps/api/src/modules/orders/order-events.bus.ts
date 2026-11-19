import { Injectable, Logger } from '@nestjs/common';
import type { OrderActor, OrderStatus } from './domain/state.js';

/** Evento de pedido publicado DEPOIS do commit: alimenta tempo real, push e e-mail (Onda 4C). */
export interface OrderEvent {
  orderId: string;
  number: string;
  userId: string;
  storeId: string;
  from: OrderStatus | null;
  to: OrderStatus;
  actor: OrderActor;
  reason: string | null;
  at: Date;
  /** Mudança da corrida de entrega que acompanha o pedido (L.3): o cliente é avisado mesmo com o mesmo estado do pedido. */
  delivery?: { id: string; status: string };
  /** Aviso avulso ao cliente (RN-19): atraso (1 push por pedido) e compensação concedida. */
  notice?: 'late' | 'late_compensation';
  /** Dados do aviso de compensação (tipo e valor do cupom). */
  compensation?: { kind: 'free_shipping' | 'fixed'; valueCents: number };
}

type Handler = (event: OrderEvent) => Promise<void> | void;

/**
 * Barramento interno e síncrono (sem fila externa: o MVP não precisa). Cada handler roda isolado: falha de push ou de
 * e-mail nunca desfaz nem atrasa o pedido (o cliente sempre recupera o estado pelo REST).
 */
@Injectable()
export class OrderEventBus {
  private readonly logger = new Logger(OrderEventBus.name);
  private readonly handlers: Handler[] = [];

  subscribe(handler: Handler): void {
    this.handlers.push(handler);
  }

  async emit(event: OrderEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.warn(`handler de evento do pedido ${event.number} falhou: ${(error as Error).message}`);
      }
    }
  }
}
