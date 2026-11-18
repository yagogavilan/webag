import { Body, Controller, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { devCreateSchema, devSimulateSchema, presentAttempt, uuid } from './payments.controllers.js';
import { PaymentsModule } from './payments.module.js';
import { PaymentsService } from './payments.service.js';
import { FakePaymentProvider, type FakeOutcome } from './providers/fake.provider.js';

/**
 * Simulação de pagamento SÓ para desenvolvimento e teste (WB-150 C2). Este módulo NÃO é registrado em produção
 * (ver `devModulesFor`): lá a rota nem existe (404), não é 403 (SEC-036). Exige login para evitar uso anônimo.
 */
@Controller('v1/dev/payments')
export class PaymentsDevController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly fake: FakePaymentProvider,
  ) {}

  @Post()
  async create(@CurrentPrincipal() _principal: Principal, @Body(new ZodPipe(devCreateSchema)) body: z.infer<typeof devCreateSchema>) {
    return presentAttempt(await this.payments.createPayment(body));
  }

  @Get(':attemptId')
  async get(@Param('attemptId') attemptId: string) {
    return presentAttempt(await this.payments.getAttempt(uuid(attemptId)));
  }

  @HttpCode(200)
  @Post(':attemptId/approve')
  approve(@Param('attemptId') attemptId: string, @Body(new ZodPipe(devSimulateSchema)) body: z.infer<typeof devSimulateSchema>) {
    return this.simulate(attemptId, 'approved', body);
  }

  @HttpCode(200)
  @Post(':attemptId/decline')
  decline(@Param('attemptId') attemptId: string, @Body(new ZodPipe(devSimulateSchema)) body: z.infer<typeof devSimulateSchema>) {
    return this.simulate(attemptId, 'declined', body);
  }

  @HttpCode(200)
  @Post(':attemptId/expire')
  expire(@Param('attemptId') attemptId: string) {
    return this.simulate(attemptId, 'expired', {});
  }

  /** Muda o estado no "provedor" e entrega a notificação assinada pelo mesmo caminho do webhook real. */
  private async simulate(attemptId: string, outcome: FakeOutcome, options: z.infer<typeof devSimulateSchema>) {
    const attempt = await this.payments.getAttempt(uuid(attemptId));
    if (!attempt.providerPaymentId) throw errors.conflict('DEV_PAYMENT_NOT_CREATED', 'Pagamento ainda não foi criado no provedor');
    if (attempt.provider !== 'fake') throw errors.conflict('DEV_PROVIDER_NOT_FAKE', 'Só funciona com o provedor fake');
    const notification = await this.fake.simulate(attempt.providerPaymentId, { outcome, ...options });
    const webhook = await this.payments.receiveWebhook(notification);
    await this.payments.processDue();
    await this.payments.drain();
    return { webhook: { duplicate: !webhook.queued }, payment: presentAttempt(await this.payments.getAttempt(attempt.id)) };
  }
}

@Module({ imports: [PaymentsModule], controllers: [PaymentsDevController] })
export class PaymentsDevModule {}

/** Módulos de simulação: nunca em produção (SEC-036). */
export function devModulesFor(nodeEnv: string | undefined): (typeof PaymentsDevModule)[] {
  return nodeEnv === 'production' ? [] : [PaymentsDevModule];
}
