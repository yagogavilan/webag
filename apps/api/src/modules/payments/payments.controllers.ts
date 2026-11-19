import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminOnly, Ctx, Public, RequireReauth, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import type { PaymentAttempt } from './payments.service.js';
import { PaymentsService } from './payments.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

/** DTO de saída explícito: dinheiro como Money em centavos; nada de ID do provedor ou dado interno. */
export function presentAttempt(attempt: PaymentAttempt) {
  return {
    id: attempt.id,
    status: attempt.status,
    method: attempt.method,
    amount: { amount: attempt.amountCents, currency: attempt.currency },
    applicationFee: { amount: attempt.applicationFeeCents, currency: attempt.currency },
    installments: attempt.installments,
    pixCopyPaste: attempt.pixCopyPaste,
    expiresAt: attempt.expiresAt?.toISOString() ?? null,
    declineReason: attempt.declineReason,
    createdAt: attempt.createdAt.toISOString(),
  };
}

/**
 * Webhook do provedor. Público (quem chama é o provedor), mas só processa o que tiver assinatura válida (SEC-032).
 * Responde 2xx rápido; o trabalho vai para a fila durável. Nenhuma rota aqui muda estado a pedido de cliente (SEC-035).
 */
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'webhook', limit: 600, windowSeconds: 60 })
  @Post(':provider')
  async receive(@Param('provider') provider: string, @Req() req: Request, @Query() query: Record<string, unknown>) {
    if (provider !== this.payments.provider.name) throw errors.notFound();
    const result = await this.payments.receiveWebhook({ headers: req.headers, query });
    return { received: true, duplicate: !result.queued };
  }
}

const refundQueueQuerySchema = z.strictObject({
  cursor: z.string().max(200).optional(),
  limit: z.string().max(4).optional(),
  status: z.enum(['pending', 'exhausted', 'covered']).optional(),
});
const coverRefundSchema = z.strictObject({ reason: z.string().min(10).max(300) });

const alertsQuerySchema = z.strictObject({
  cursor: z.string().max(200).optional(),
  limit: z.string().max(4).optional(),
  openOnly: z.enum(['true', 'false']).optional(),
});

@Controller('v1/admin/payments')
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @AdminOnly('payments:alerts:read')
  @Get('alerts')
  async alerts(@Query(new ZodPipe(alertsQuerySchema)) query: z.infer<typeof alertsQuerySchema>) {
    const page = await this.payments.listAlerts({ ...query, openOnly: query.openOnly === 'true' });
    return {
      data: page.data.map((alert) => ({ ...alert, createdAt: alert.createdAt.toISOString(), resolvedAt: alert.resolvedAt?.toISOString() ?? null })),
      nextCursor: page.nextCursor,
    };
  }

  @AdminOnly('payments:refunds:read')
  @Get('refund-queue')
  async refundQueue(@Query(new ZodPipe(refundQueueQuerySchema)) query: z.infer<typeof refundQueueQuerySchema>) {
    return this.payments.listRefundQueue(query);
  }

  @AdminOnly('payments:refunds:retry')
  @RequireReauth()
  @HttpCode(200)
  @Post('refund-queue/:intentId/retry')
  async retryRefund(@Param('intentId') intentId: string, @Ctx() ctx: RequestContext) {
    return this.payments.retryRefundIntent(uuid(intentId), ctx);
  }

  @AdminOnly('payments:refunds:cover')
  @RequireReauth()
  @HttpCode(204)
  @Post('refund-queue/:intentId/cover')
  async coverRefund(@Param('intentId') intentId: string, @Body(new ZodPipe(coverRefundSchema)) body: z.infer<typeof coverRefundSchema>, @Ctx() ctx: RequestContext): Promise<void> {
    await this.payments.coverRefundIntent(uuid(intentId), body.reason, ctx);
  }

  @AdminOnly('payments:webhooks:reprocess')
  @HttpCode(204)
  @Post('webhook-events/:eventId/reprocess')
  async reprocess(@Param('eventId') eventId: string, @Ctx() ctx: RequestContext): Promise<void> {
    const id = Number(eventId);
    if (!Number.isSafeInteger(id) || id < 1) throw errors.notFound();
    await this.payments.reprocess(id, ctx);
  }
}

const devCreateSchema = z.strictObject({
  amountCents: z.number().int().positive(),
  method: z.enum(['pix', 'card']),
  storeId: z.uuid().nullable().default(null),
  externalReference: z.string().min(1).max(80).default('dev-order'),
  applicationFeeCents: z.number().int().min(0).default(0),
  installments: z.number().int().min(1).max(12).optional(),
  cardToken: z.string().max(80).optional(),
});
const devSimulateSchema = z.strictObject({
  reportedAmountCents: z.number().int().optional(),
  reportedReference: z.string().max(80).optional(),
  reportedReceiverId: z.string().max(100).optional(),
  reportedFeeCents: z.number().int().optional(),
});

export { devCreateSchema, devSimulateSchema, uuid };
