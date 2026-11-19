var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';
const ticketSchema = z.strictObject({ scope: z.enum(['user', 'store', 'admin']), storeId: z.uuid().optional() });
let RealtimeTicketsController = class RealtimeTicketsController {
    tickets;
    constructor(tickets) {
        this.tickets = tickets;
    }
    /**
     * Ticket de uso único (60 s) para abrir o Socket.IO `/rt` com `auth: { ticket }`, atrelado a usuário, sessão e escopo (`store` com
     * `storeId`, `admin` ou `user`). Loja de que não sou membro com a permissão de pedidos: 404. Admin sem MFA/permissão: 403.
     */
    issue(principal, body) {
        return this.tickets.issue(principal, body);
    }
};
__decorate([
    Post('tickets'),
    HttpCode(200),
    RateLimit({ name: 'realtime-ticket', limit: 60, windowSeconds: 60 }),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(ticketSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RealtimeTicketsController.prototype, "issue", null);
RealtimeTicketsController = __decorate([
    Controller('v1/realtime'),
    __metadata("design:paramtypes", [RealtimeTicketService])
], RealtimeTicketsController);
export { RealtimeTicketsController };
//# sourceMappingURL=realtime-tickets.controller.js.map