import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Ctx, type RequestContext } from '../../platform/auth/decorators.js';
import { adminHasPermission } from '../../platform/auth/permissions.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuditService } from '../admin/index.js';
import { LogisticsReportService } from './logistics-report.service.js';
import { couriers } from './db/schema.js';
import { CouriersService } from './couriers.service.js';
import { DeliveriesService, type Delivery, type DeliveryEvent } from './deliveries.service.js';
import { ACTIVE_STATUSES, DELIVERY_KINDS, DELIVERY_STATUSES, NOT_DELIVERED_REASONS } from './domain/state.js';
import type { DeliveryMessageData } from './domain/whatsapp.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};
const money = (amount: number) => ({ amount, currency: 'BRL' as const });

const presentCourier = (c: typeof couriers.$inferSelect & { deliveriesLast7Days?: number; busyNow?: boolean }) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  note: c.note,
  active: c.active,
  documentsCheckedAt: c.documentsCheckedAt.toISOString(),
  ...(c.deliveriesLast7Days !== undefined ? { deliveriesLast7Days: c.deliveriesLast7Days, busyNow: c.busyNow ?? false } : {}),
  createdAt: c.createdAt.toISOString(),
});

/**
 * Corrida para o painel. LGPD (WB-230/RN-18): nome, telefone e endereço do cliente só aparecem enquanto a corrida está ativa;
 * depois de concluída o painel mostra só bairro e cidade. Nunca o CÓDIGO de entrega (esse é do cliente).
 */
/** (11) 9****-7777: o suficiente para o operador reconhecer o cliente sem ver o número (SEC-144). */
export const maskPhone = (digits: string | null | undefined): string | null => {
  const d = (digits ?? '').replace(/\D/g, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]}****-${d.slice(7)}` : null;
};

function presentDelivery(d: Delivery & { waitingMinutes?: number | null; sla?: string | null }, detail: boolean, courierName: string | null = null) {
  const contact = (d.contact ?? {}) as Partial<DeliveryMessageData>;
  const active = ACTIVE_STATUSES.includes(d.status);
  const place = (contact.dropoffAddress ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return {
    id: d.id,
    kind: d.kind,
    orderId: d.orderId,
    orderNumber: contact.number ?? null,
    storeId: d.storeId,
    storeName: contact.storeName ?? null,
    status: d.status,
    readyAt: d.readyAt.toISOString(),
    waitingMinutes: d.waitingMinutes ?? null,
    sla: d.sla ?? null,
    courier: d.courierId ? { id: d.courierId, name: courierName } : null,
    volumes: d.volumes,
    note: d.note,
    destination: place.slice(-2).join(', ') || null,
    /** SEC-144: telefone mascarado (ativa) para a lista; o número inteiro e o endereço só por `contact-reveal` (motivo + auditoria). */
    customerPhoneMasked: active ? maskPhone(contact.customerPhone) : null,
    contactRevealable: active && d.contact !== null && d.piiClearedAt === null,
    fee: money(d.feeCents),
    expectedCost: money(d.expectedCostCents),
    cost: d.costCents === null ? null : money(d.costCents),
    /** SEC-145: quem lançou o custo (o relatório "a pagar" mostra, e quem lançou não o marca como pago). */
    costRegisteredBy: d.costRegisteredBy ?? null,
    costPaidAt: d.costPaidAt?.toISOString() ?? null,
    attempts: d.attempts,
    failReason: d.failReason,
    whatsappSentAt: d.whatsappSentAt?.toISOString() ?? null,
    codeRequired: d.deliveryCode !== null && d.status !== 'delivered',
    allowedActions: allowedActions(d.status),
    updatedAt: d.updatedAt.toISOString(),
    ...(detail && active
      ? { contact: { pickupAddress: contact.pickupAddress ?? null, storePhone: contact.storePhone ?? null, dropoffAddress: contact.dropoffAddress ?? null, customerFirstName: contact.customerFirstName ?? null, customerPhone: contact.customerPhone ?? null } }
      : {}),
  };
}

const ACTIONS_BY_STATUS: Record<string, string[]> = {
  ready_for_collection: ['assign', 'cancel'],
  awaiting_courier: ['confirm', 'reassign', 'cancel'],
  courier_en_route: ['picked_up', 'reassign', 'cancel'],
  out_for_delivery: ['delivered', 'not_delivered'],
  not_delivered: ['reattempt', 'return_confirmed'],
};
const allowedActions = (status: string): string[] => ACTIONS_BY_STATUS[status] ?? [];

const presentEvent = (e: DeliveryEvent) => ({ id: e.id, from: e.fromStatus, to: e.toStatus, action: e.action, actorRole: e.actorRole, reason: e.reason, at: e.createdAt.toISOString() });

const courierBody = z.strictObject({
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(8).max(25),
  note: z.string().trim().max(100).nullable().optional(),
  documentsChecked: z.boolean(),
});
const courierPatch = z.strictObject({
  name: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().min(8).max(25).optional(),
  note: z.string().trim().max(100).nullable().optional(),
  active: z.boolean().optional(),
});
const courierQuery = z.strictObject({ q: z.string().max(60).optional(), active: z.enum(['true', 'false']).optional(), cursor: z.string().max(300).optional(), limit: z.string().max(4).optional() });
const listQuery = z.strictObject({
  tab: z.enum(['active', 'done']).optional(),
  status: z.enum(DELIVERY_STATUSES).optional(),
  kind: z.enum(DELIVERY_KINDS).optional(),
  courierId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  cityId: z.uuid().optional(),
  cursor: z.string().max(300).optional(),
  limit: z.string().max(4).optional(),
});
const assignBody = z.strictObject({ courierId: z.uuid(), addressConfirmed: z.boolean().optional() });
const actionBody = z.strictObject({
  action: z.enum(['confirm', 'picked_up', 'delivered', 'not_delivered', 'reattempt', 'return_confirmed', 'reassign', 'cancel']),
  reason: z.string().trim().max(200).optional(),
  code: z.string().regex(/^\d{4}$/).optional(),
  failReason: z.enum(NOT_DELIVERED_REASONS).optional(),
  overrideReason: z.string().trim().min(10).max(200).optional(),
});
const costBody = z.strictObject({ costCents: z.number().int().min(0).max(100_000), reason: z.string().trim().min(3).max(200).optional() });
const payoutBody = z.strictObject({ deliveryIds: z.array(z.uuid()).min(1).max(100), paidOn: z.iso.date(), overrideReason: z.string().trim().min(10).max(200).optional() });
const revealBody = z.strictObject({ reason: z.string().trim().min(10).max(200) });

/** Motoboys (WB-231): operação e super admin cadastram; financeiro e suporte leem. */
@Controller('v1/admin/logistics/couriers')
export class CouriersAdminController {
  constructor(private readonly couriers: CouriersService) {}

  @AdminOnly('logistics:read')
  @Get()
  async list(@Query(new ZodPipe(courierQuery)) query: z.infer<typeof courierQuery>) {
    const page = await this.couriers.list({ ...(query.q ? { q: query.q } : {}), ...(query.cursor ? { cursor: query.cursor } : {}), limit: query.limit, ...(query.active ? { active: query.active === 'true' } : {}) });
    return { data: page.data.map(presentCourier), nextCursor: page.nextCursor };
  }

  @AdminOnly('logistics:write')
  @RateLimit({ name: 'admin-courier-write', limit: 120, windowSeconds: 3600 })
  @Post()
  async create(@Body(new ZodPipe(courierBody)) body: z.infer<typeof courierBody>, @Ctx() ctx: RequestContext) {
    return presentCourier(await this.couriers.create(body, ctx));
  }

  @AdminOnly('logistics:write')
  @Patch(':courierId')
  async update(@Param('courierId') courierId: string, @Body(new ZodPipe(courierPatch)) body: z.infer<typeof courierPatch>, @Ctx() ctx: RequestContext) {
    return presentCourier(await this.couriers.update(uuid(courierId), body, ctx));
  }
}

/** Corridas: fila, atribuição, estados, WhatsApp e custo. */
@Controller('v1/admin/logistics/deliveries')
export class DeliveriesAdminController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly couriers: CouriersService,
  ) {}

  private async courierName(id: string | null): Promise<string | null> {
    return id ? (await this.couriers.get(id)).name : null;
  }

  @AdminOnly('logistics:read')
  @Get()
  async list(@Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const page = await this.deliveries.list(query);
    const ids = [...new Set(page.data.map((d) => d.courierId).filter((id): id is string => !!id))];
    const names = new Map<string, string>();
    for (const id of ids) names.set(id, await this.courierName(id) ?? '');
    return { data: page.data.map((d) => presentDelivery(d, false, d.courierId ? (names.get(d.courierId) ?? null) : null)), nextCursor: page.nextCursor };
  }

  /** SEC-144: o contato do cliente só vem no detalhe para quem despacha (`logistics:write`); os demais perfis usam "Revelar" (com motivo e auditoria). */
  @AdminOnly('logistics:read')
  @Get(':deliveryId')
  async get(@Param('deliveryId') deliveryId: string, @Ctx() ctx: RequestContext) {
    const delivery = await this.deliveries.get(uuid(deliveryId));
    const profile = ctx.principal?.adminProfile;
    const showContact = !!profile && adminHasPermission(profile, 'logistics:write');
    return { ...presentDelivery(delivery, showContact, await this.courierName(delivery.courierId)), timeline: (await this.deliveries.events(delivery.id)).map(presentEvent) };
  }

  /** "Revelar" o contato do cliente: motivo obrigatório, leitura auditada, 409 depois da retenção (SEC-144). */
  @AdminOnly('logistics:contact')
  @HttpCode(200)
  @RateLimit({ name: 'admin-delivery-contact-reveal', limit: 60, windowSeconds: 3600 })
  @Post(':deliveryId/contact-reveal')
  async revealContact(@Param('deliveryId') deliveryId: string, @Body(new ZodPipe(revealBody)) body: z.infer<typeof revealBody>, @Ctx() ctx: RequestContext) {
    const delivery = await this.deliveries.revealContact(uuid(deliveryId), body.reason, ctx);
    const contact = (delivery.contact ?? {}) as Partial<DeliveryMessageData>;
    return { contact: { pickupAddress: contact.pickupAddress ?? null, storePhone: contact.storePhone ?? null, dropoffAddress: contact.dropoffAddress ?? null, customerFirstName: contact.customerFirstName ?? null, customerPhone: contact.customerPhone ?? null } };
  }

  /** Atribuir: PRONTA -> AGUARDANDO. 409 `DELIVERY_ALREADY_ASSIGNED` se outra pessoa chegou primeiro. */
  @AdminOnly('logistics:write')
  @HttpCode(200)
  @Post(':deliveryId/assign')
  async assign(@Param('deliveryId') deliveryId: string, @Body(new ZodPipe(assignBody)) body: z.infer<typeof assignBody>, @Ctx() ctx: RequestContext) {
    const delivery = await this.deliveries.assign(uuid(deliveryId), body.courierId, { addressConfirmed: body.addressConfirmed === true }, ctx);
    return presentDelivery(delivery, true, await this.courierName(delivery.courierId));
  }

  /** SEC-144: a mensagem leva telefone e endereço do cliente; só quem despacha. */
  @AdminOnly('logistics:write')
  @Get(':deliveryId/whatsapp')
  async whatsapp(@Param('deliveryId') deliveryId: string) {
    return this.deliveries.whatsapp(uuid(deliveryId));
  }

  @AdminOnly('logistics:write')
  @HttpCode(204)
  @Post(':deliveryId/whatsapp-sent')
  async whatsappSent(@Param('deliveryId') deliveryId: string, @Ctx() ctx: RequestContext): Promise<void> {
    await this.deliveries.markWhatsappSent(uuid(deliveryId), ctx);
  }

  @AdminOnly('logistics:write')
  @HttpCode(200)
  @RateLimit({ name: 'admin-delivery-action', limit: 600, windowSeconds: 3600 })
  @Post(':deliveryId/status')
  async status(@Param('deliveryId') deliveryId: string, @Body(new ZodPipe(actionBody)) body: z.infer<typeof actionBody>, @Ctx() ctx: RequestContext) {
    const { action, ...input } = body;
    const delivery = await this.deliveries.act(uuid(deliveryId), action, input, ctx);
    return presentDelivery(delivery, true, await this.courierName(delivery.courierId));
  }

  /** Custo pago ao motoboy (WB-239); correção exige motivo e preserva o valor anterior no histórico. */
  @AdminOnly('logistics:write')
  @Put(':deliveryId/cost')
  async cost(@Param('deliveryId') deliveryId: string, @Body(new ZodPipe(costBody)) body: z.infer<typeof costBody>, @Ctx() ctx: RequestContext) {
    const delivery = await this.deliveries.setCost(uuid(deliveryId), body.costCents, body.reason, ctx);
    return presentDelivery(delivery, false, await this.courierName(delivery.courierId));
  }

  /** SEC-145: financeiro e super admin; quem lançou o custo não marca como pago (403 `SEGREGATION_OF_DUTIES`; super admin com `overrideReason`). */
  @AdminOnly('logistics:payout')
  @HttpCode(200)
  @Post('payouts')
  async payouts(@Body(new ZodPipe(payoutBody)) body: z.infer<typeof payoutBody>, @Ctx() ctx: RequestContext) {
    const result = await this.deliveries.markPaid(body.deliveryIds, new Date(`${body.paidOn}T12:00:00-03:00`), ctx, body.overrideReason);
    return { count: result.count, total: money(result.totalCents) };
  }
}

const reportQuery = z
  .strictObject({
    from: z.iso.date(),
    to: z.iso.date(),
    cityId: z.uuid().optional(),
    storeId: z.uuid().optional(),
    courierId: z.uuid().optional(),
    kind: z.enum(DELIVERY_KINDS).optional(),
    format: z.enum(['json', 'csv']).optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'O início do período não pode ser depois do fim.', path: ['from'] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366, { message: 'Período de no máximo 366 dias.', path: ['to'] });

/** Relatórios de logística (WB-240): super admin, operação e financeiro; suporte não vê custo. */
@Controller('v1/admin/logistics/reports')
export class LogisticsReportsController {
  constructor(
    private readonly reports: LogisticsReportService,
    private readonly audit: AuditService,
  ) {}

  @AdminOnly('logistics:report')
  @Get('summary')
  summary(@Query(new ZodPipe(reportQuery)) query: z.infer<typeof reportQuery>) {
    return this.reports.summary({ from: query.from, to: query.to, cityId: query.cityId, storeId: query.storeId, courierId: query.courierId, kind: query.kind });
  }

  /** "A pagar por motoboy"; `format=csv` exporta e a exportação é auditada (WB-240 C2). */
  @AdminOnly('logistics:report')
  @Get('payable')
  async payable(@Query(new ZodPipe(reportQuery)) query: z.infer<typeof reportQuery>, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.payable({ from: query.from, to: query.to, cityId: query.cityId, storeId: query.storeId, courierId: query.courierId, kind: query.kind });
    if (query.format === 'csv') {
      await this.audit.recordStandalone(ctx, { action: 'logistics.payable.export', targetType: 'report', targetId: 'logistics-payable', after: { from: query.from, to: query.to, couriers: report.data.length, totalCents: report.total.amount } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="a-pagar-${query.from}-${query.to}.csv"`);
      return this.reports.payableCsv(report);
    }
    return report;
  }
}
