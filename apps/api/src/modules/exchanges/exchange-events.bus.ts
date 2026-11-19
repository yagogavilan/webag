import { Injectable, Logger } from '@nestjs/common';
import type { ExchangeActor, ExchangeStatus } from './db/schema.js';

/** Evento da solicitação de troca, publicado DEPOIS do commit: alimenta tempo real, push e e-mail (mesmo desenho do `OrderEventBus`). */
export interface ExchangeEvent {
  exchangeId: string;
  number: string;
  orderId: string;
  userId: string;
  storeId: string;
  type: string;
  from: ExchangeStatus | null;
  to: ExchangeStatus;
  actor: ExchangeActor;
  reason: string | null;
  at: Date;
}

type Handler = (event: ExchangeEvent) => Promise<void> | void;

@Injectable()
export class ExchangeEventBus {
  private readonly logger = new Logger(ExchangeEventBus.name);
  private readonly handlers: Handler[] = [];

  subscribe(handler: Handler): void {
    this.handlers.push(handler);
  }

  async emit(event: ExchangeEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.warn(`handler de evento da troca ${event.number} falhou: ${(error as Error).message}`);
      }
    }
  }
}
