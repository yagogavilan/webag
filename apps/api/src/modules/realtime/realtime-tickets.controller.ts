import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';

const ticketSchema = z.strictObject({ scope: z.enum(['user', 'store', 'admin']), storeId: z.uuid().optional() });

@Controller('v1/realtime')
export class RealtimeTicketsController {
  constructor(private readonly tickets: RealtimeTicketService) {}

  /**
   * Ticket de uso único (60 s) para abrir o Socket.IO `/rt` com `auth: { ticket }`, atrelado a usuário, sessão e escopo (`store` com
   * `storeId`, `admin` ou `user`). Loja de que não sou membro com a permissão de pedidos: 404. Admin sem MFA/permissão: 403.
   */
  @Post('tickets')
  @HttpCode(200)
  @RateLimit({ name: 'realtime-ticket', limit: 60, windowSeconds: 60 })
  issue(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(ticketSchema)) body: z.infer<typeof ticketSchema>) {
    return this.tickets.issue(principal, body);
  }
}
