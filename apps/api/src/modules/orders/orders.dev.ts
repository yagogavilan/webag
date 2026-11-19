import { Body, Controller, HttpCode, Module, Param, Post } from '@nestjs/common';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { DevPaymentSimulator, PaymentsDevModule } from '../payments/payments.dev.js';
import { devSimulateSchema, uuid } from '../payments/payments.controllers.js';
import { OrdersModule } from './orders.module.js';
import { OrdersService } from './orders.service.js';

/**
 * F1 (app): simulação do pagamento POR PEDIDO, para o botão "Simular pagamento" do app (que só conhece o id do pedido, não o da tentativa).
 * Só a conta dona do pedido (404 para as demais), só provedor `fake` (409 nos demais) e só onde `devOrderModulesFor` registra o módulo
 * (development e test): em produção e no staging a rota nem existe (404, SEC-036/135). Mesmo caminho do webhook assinado da rota por tentativa.
 */
@Controller('v1/dev/orders')
export class OrdersPaymentDevController {
  constructor(
    private readonly orders: OrdersService,
    private readonly simulator: DevPaymentSimulator,
  ) {}

  @HttpCode(200)
  @Post(':orderId/payment/approve')
  async approve(@CurrentPrincipal() principal: Principal, @Param('orderId') orderId: string, @Body(new ZodPipe(devSimulateSchema)) body: z.infer<typeof devSimulateSchema>) {
    return this.simulator.simulate(await this.orders.paymentAttemptIdOf(principal, uuid(orderId)), 'approved', body);
  }

  @HttpCode(200)
  @Post(':orderId/payment/decline')
  async decline(@CurrentPrincipal() principal: Principal, @Param('orderId') orderId: string, @Body(new ZodPipe(devSimulateSchema)) body: z.infer<typeof devSimulateSchema>) {
    return this.simulator.simulate(await this.orders.paymentAttemptIdOf(principal, uuid(orderId)), 'declined', body);
  }

  @HttpCode(200)
  @Post(':orderId/payment/expire')
  async expire(@CurrentPrincipal() principal: Principal, @Param('orderId') orderId: string) {
    return this.simulator.simulate(await this.orders.paymentAttemptIdOf(principal, uuid(orderId)), 'expired', {});
  }
}

@Module({ imports: [OrdersModule, PaymentsDevModule], controllers: [OrdersPaymentDevController] })
export class OrdersDevModule {}

/** Módulos de simulação por pedido: nunca em produção nem no staging (SEC-036, SEC-135). */
export function devOrderModulesFor(nodeEnv: string | undefined): (typeof OrdersDevModule)[] {
  return nodeEnv === 'development' || nodeEnv === 'test' ? [OrdersDevModule] : [];
}
