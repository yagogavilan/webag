import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ExchangeEventBus, type ExchangeEvent } from '../exchanges/index.js';
import { OrderEventBus, type OrderEvent } from '../orders/index.js';
import { ADMIN_OPS_ROOM, orderRoom, RealtimeGateway, storeRoom, userRoom } from './realtime.gateway.js';

/**
 * Publica no tempo real os eventos de domínio que já saem DEPOIS do commit (barramentos de pedido e de troca). Payload mínimo e
 * versionado: tipo, ids, estado, versão e hora. Nada de dado pessoal; quem precisa de mais busca no REST.
 */
@Injectable()
export class RealtimeService implements OnModuleInit {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly orderBus: OrderEventBus,
    private readonly exchangeBus: ExchangeEventBus,
  ) {}

  onModuleInit(): void {
    this.orderBus.subscribe((event) => this.onOrder(event));
    this.exchangeBus.subscribe((event) => this.onExchange(event));
  }

  private onOrder(e: OrderEvent): void {
    const base = { v: 1, orderId: e.orderId, number: e.number, status: e.to, occurredAt: e.at.toISOString() };
    this.gateway.emit([userRoom(e.userId), storeRoom(e.storeId), orderRoom(e.orderId)], 'order.status_changed', { type: 'order.status_changed', ...base, ...(e.delivery ? { delivery: e.delivery.status } : {}) });
    // Pedido novo (pago) para a loja: o painel toca o alerta sonoro (WB-192).
    if (e.to === 'received' && e.from === 'awaiting_payment') this.gateway.emit([storeRoom(e.storeId)], 'order.created', { type: 'order.created', ...base });
    // Pronto para coleta: a operação da Webag precisa atribuir o motoboy (DEC-036, WB-230 C4).
    if (e.to === 'ready_for_collection' && e.from !== 'ready_for_collection') this.gateway.emit([ADMIN_OPS_ROOM], 'delivery_ready', { type: 'delivery_ready', v: 1, orderId: e.orderId, number: e.number, storeId: e.storeId, occurredAt: base.occurredAt });
  }

  private onExchange(e: ExchangeEvent): void {
    const base = { type: 'exchange.status_changed', v: 1, exchangeId: e.exchangeId, number: e.number, orderId: e.orderId, status: e.to, occurredAt: e.at.toISOString() };
    this.gateway.emit([userRoom(e.userId), storeRoom(e.storeId)], 'exchange.status_changed', base);
    if (e.to === 'requested') this.gateway.emit([storeRoom(e.storeId)], 'exchange.requested', { ...base, type: 'exchange.requested' });
  }
}
