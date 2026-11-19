var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { ExchangeEventBus } from '../exchanges/index.js';
import { OrderEventBus } from '../orders/index.js';
import { ADMIN_OPS_ROOM, orderRoom, RealtimeGateway, storeRoom, userRoom } from './realtime.gateway.js';
/**
 * Publica no tempo real os eventos de domínio que já saem DEPOIS do commit (barramentos de pedido e de troca). Payload mínimo e
 * versionado: tipo, ids, estado, versão e hora. Nada de dado pessoal; quem precisa de mais busca no REST.
 */
let RealtimeService = class RealtimeService {
    gateway;
    orderBus;
    exchangeBus;
    constructor(gateway, orderBus, exchangeBus) {
        this.gateway = gateway;
        this.orderBus = orderBus;
        this.exchangeBus = exchangeBus;
    }
    onModuleInit() {
        this.orderBus.subscribe((event) => this.onOrder(event));
        this.exchangeBus.subscribe((event) => this.onExchange(event));
    }
    onOrder(e) {
        const base = { v: 1, orderId: e.orderId, number: e.number, status: e.to, occurredAt: e.at.toISOString() };
        this.gateway.emit([userRoom(e.userId), storeRoom(e.storeId), orderRoom(e.orderId)], 'order.status_changed', { type: 'order.status_changed', ...base, ...(e.delivery ? { delivery: e.delivery.status } : {}) });
        // Pedido novo (pago) para a loja: o painel toca o alerta sonoro (WB-192).
        if (e.to === 'received' && e.from === 'awaiting_payment')
            this.gateway.emit([storeRoom(e.storeId)], 'order.created', { type: 'order.created', ...base });
        // Pronto para coleta: a operação da Webag precisa atribuir o motoboy (DEC-036, WB-230 C4).
        if (e.to === 'ready_for_collection' && e.from !== 'ready_for_collection')
            this.gateway.emit([ADMIN_OPS_ROOM], 'delivery_ready', { type: 'delivery_ready', v: 1, orderId: e.orderId, number: e.number, storeId: e.storeId, occurredAt: base.occurredAt });
    }
    onExchange(e) {
        const base = { type: 'exchange.status_changed', v: 1, exchangeId: e.exchangeId, number: e.number, orderId: e.orderId, status: e.to, occurredAt: e.at.toISOString() };
        this.gateway.emit([userRoom(e.userId), storeRoom(e.storeId)], 'exchange.status_changed', base);
        if (e.to === 'requested')
            this.gateway.emit([storeRoom(e.storeId)], 'exchange.requested', { ...base, type: 'exchange.requested' });
    }
};
RealtimeService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [RealtimeGateway,
        OrderEventBus,
        ExchangeEventBus])
], RealtimeService);
export { RealtimeService };
//# sourceMappingURL=realtime.service.js.map