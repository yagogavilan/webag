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

/** Lembrete à loja do fim do SLA de resposta (DT-050): não muda o estado, só avisa. */
export interface ExchangeReminder {
  exchangeId: string;
  number: string;
  storeId: string;
  type: string;
  /** Horas que faltam (12 ou 4) para a aprovação automática. */
  hoursLeft: number;
  deadlineAt: Date;
}

type Handler = (event: ExchangeEvent) => Promise<void> | void;
type ReminderHandler = (reminder: ExchangeReminder) => Promise<void> | void;

@Injectable()
export class ExchangeEventBus {
  private readonly logger = new Logger(ExchangeEventBus.name);
  private readonly handlers: Handler[] = [];
  private readonly reminderHandlers: ReminderHandler[] = [];

  subscribeReminder(handler: ReminderHandler): void {
    this.reminderHandlers.push(handler);
  }

  async emitReminder(reminder: ExchangeReminder): Promise<void> {
    for (const handler of this.reminderHandlers) {
      try {
        await handler(reminder);
      } catch (error) {
        this.logger.warn(`handler de lembrete da troca ${reminder.number} falhou: ${(error as Error).message}`);
      }
    }
  }

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
