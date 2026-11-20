import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { ALERT_AREAS, ALERT_SEVERITIES } from '../admin/index.js';
import { AlertsService } from './alerts.service.js';
import { limitQuery } from '../../platform/http/pagination.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const alertId = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

const alertsQuerySchema = z.strictObject({
  status: z.enum(['open', 'resolved', 'all']).optional(),
  area: z.enum(ALERT_AREAS).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  kind: z.string().regex(/^[a-z_]{3,60}$/).optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
});
const resolveSchema = z.strictObject({ note: z.string().trim().min(5, 'Escreva uma nota de ao menos 5 caracteres.').max(300) });

/** Perfil do admin da requisição (o guard já garantiu que existe). */
const profileOf = (principal: Principal) => {
  if (!principal.adminProfile) throw errors.forbidden();
  return principal.adminProfile;
};

/** B3 / WB-198 / WB-113 (leitura): caixa de alertas de operação. */
@Controller('v1/admin/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @AdminOnly('alerts:read')
  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(alertsQuerySchema)) query: z.infer<typeof alertsQuerySchema>) {
    return this.alerts.list(profileOf(principal), query);
  }

  /** Contagem dos abertos (do perfil) por gravidade, área e tipo: alimenta o contador do Início e da barra. */
  @AdminOnly('alerts:read')
  @Get('summary')
  summary(@CurrentPrincipal() principal: Principal) {
    return this.alerts.summary(profileOf(principal));
  }

  /** Os tipos que o perfil vê, com rótulo, gravidade, área e o que fazer (para os filtros do painel). */
  @AdminOnly('alerts:read')
  @Get('kinds')
  kinds(@CurrentPrincipal() principal: Principal) {
    return { data: this.alerts.kinds(profileOf(principal)), nextCursor: null };
  }

  @AdminOnly('alerts:read')
  @Get(':alertId')
  get(@CurrentPrincipal() principal: Principal, @Param('alertId') id: string) {
    return this.alerts.get(profileOf(principal), alertId(id));
  }

  /** Encerra o alerta com nota (WB-113 C2 "Resolvida"). Auditado. */
  @AdminOnly('alerts:resolve')
  @HttpCode(200)
  @RateLimit({ name: 'admin-alert-resolve', limit: 120, windowSeconds: 3600 })
  @Post(':alertId/resolve')
  resolve(@CurrentPrincipal() principal: Principal, @Param('alertId') id: string, @Body(new ZodPipe(resolveSchema)) body: z.infer<typeof resolveSchema>, @Ctx() ctx: RequestContext) {
    return this.alerts.resolve(profileOf(principal), alertId(id), body.note, ctx);
  }
}
