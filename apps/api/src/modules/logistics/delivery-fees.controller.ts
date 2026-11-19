import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, StorePermission, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { DeliveryFeesService, type FeeTable } from './delivery-fees.service.js';
import { FEE_SCOPE_TYPES } from './db/schema.js';

const tierSchema = z.strictObject({
  fromM: z.number().int().min(0),
  toM: z.number().int().min(1),
  feeCents: z.number().int().min(0).max(5000),
  /** Ausente = 50% da taxa de entrega, arredondado para cima (DEC-039a). */
  exchangeFeeCents: z.number().int().min(0).max(10_000).optional(),
  expectedCostCents: z.number().int().min(0).max(20_000).default(0),
  etaMinutes: z.number().int().min(0).max(240).default(0),
});
const putSchema = z.strictObject({
  scopeType: z.enum(FEE_SCOPE_TYPES),
  scopeId: z.uuid().nullable().optional(),
  tiers: z.array(tierSchema).min(1).max(6),
  effectiveFrom: z.iso.datetime().optional(),
  reason: z.string().trim().min(3).max(300),
  expectedVersion: z.number().int().min(0),
});
const scopeQuery = z.strictObject({ scopeType: z.enum(FEE_SCOPE_TYPES), scopeId: z.uuid().optional() });
const previewQuery = z.strictObject({
  storeId: z.uuid(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  cityId: z.uuid().optional(),
  neighborhoodId: z.uuid().optional(),
  subtotalCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
});

const present = (table: FeeTable) => ({
  id: table.id,
  scopeType: table.scopeType,
  scopeId: table.scopeType === 'default' ? null : table.scopeKey,
  version: table.version,
  effectiveFrom: table.effectiveFrom.toISOString(),
  reason: table.reason,
  createdAt: table.createdAt.toISOString(),
  tiers: table.tiers,
});

/** Tabela de taxa de entrega, pedido mínimo e frete grátis (WB-236). Pedido mínimo e frete grátis são os parâmetros globais. */
@Controller('v1/admin/delivery-fees')
export class DeliveryFeesAdminController {
  constructor(private readonly fees: DeliveryFeesService) {}

  @AdminOnly('delivery-fees:read')
  @Get()
  async list() {
    // Uma tabela em vigor por escopo (poucas dezenas: cidades e bairros da região), sem cursor.
    const rows = await this.fees.list();
    return { data: rows.map((row) => ({ ...present(row), scopeName: row.scopeName })), nextCursor: null };
  }

  @AdminOnly('delivery-fees:read')
  @Get('history')
  async history(@Query(new ZodPipe(scopeQuery)) query: z.infer<typeof scopeQuery>) {
    const rows = await this.fees.history(query.scopeType, query.scopeId ?? null);
    return { data: rows.map(present), nextCursor: null };
  }

  /** Mesma função do carrinho (`quote`): o valor da prévia é igual ao do checkout (WB-236 C6). */
  @AdminOnly('delivery-fees:read')
  @Get('preview')
  async preview(@Query(new ZodPipe(previewQuery)) query: z.infer<typeof previewQuery>) {
    const quote = await this.fees.quote(query.storeId, { lat: query.lat, lng: query.lng, cityId: query.cityId ?? null, neighborhoodId: query.neighborhoodId ?? null }, query.subtotalCents);
    return {
      available: quote.available,
      reason: quote.reason,
      distanceM: quote.distanceM,
      fee: quote.feeCents === null ? null : { amount: quote.feeCents, currency: 'BRL' },
      freeShipping: quote.freeShipping,
      belowMinimum: quote.belowMinimum,
      minOrder: { amount: quote.minOrderCents, currency: 'BRL' },
      etaMinutes: quote.etaMinutes,
      expectedCost: quote.snapshot ? { amount: quote.snapshot.expectedCostCents, currency: 'BRL' } : null,
      exchangeFee: quote.snapshot ? { amount: quote.snapshot.exchangeFeeCents, currency: 'BRL' } : null,
      /** Margem prevista = taxa cobrada menos custo previsto do motoboy (negativa = prejuízo, WB-236 C7). */
      expectedMargin: quote.snapshot && quote.feeCents !== null ? { amount: quote.feeCents - quote.snapshot.expectedCostCents, currency: 'BRL' } : null,
    };
  }

  @AdminOnly('delivery-fees:write')
  @Put()
  async put(@Body(new ZodPipe(putSchema)) body: z.infer<typeof putSchema>, @Ctx() ctx: RequestContext) {
    const table = await this.fees.put(
      {
        scopeType: body.scopeType,
        scopeId: body.scopeId ?? null,
        tiers: body.tiers.map((t) => ({ ...t, exchangeFeeCents: t.exchangeFeeCents ?? Math.ceil(t.feeCents / 2) })),
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
        reason: body.reason,
        expectedVersion: body.expectedVersion,
      },
      ctx,
    );
    return present(table);
  }
}

const storePreviewBody = z
  .strictObject({
    /** Ponto do endereço de teste OU a distância direta em km (exatamente um dos dois). */
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    distanceKm: z.number().min(0).max(100).optional(),
    /** Preparo do formulário (ainda não salvo); sem ele vale o salvo da loja. */
    prepMin: z.number().int().min(5).max(120).optional(),
    cityId: z.uuid().optional(),
    neighborhoodId: z.uuid().optional(),
  })
  .refine((v) => (v.distanceKm !== undefined) !== (v.lat !== undefined || v.lng !== undefined), { message: 'Informe o ponto (lat e lng) OU a distância em km.', path: ['distanceKm'] })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'Informe lat e lng juntos.', path: ['lat'] });

/** W.5 (WB-257): "Prévia para o cliente" do lojista, com a mesma conta do checkout. Só o dono (permissão `settings`); outra loja: 404. */
@Controller('v1/stores/:storeId/delivery-preview')
export class StoreDeliveryPreviewController {
  constructor(private readonly fees: DeliveryFeesService) {}

  @StorePermission('settings')
  @HttpCode(200)
  @RateLimit({ name: 'store-delivery-preview', limit: 240, windowSeconds: 3600 })
  @Post()
  preview(@Param('storeId') storeId: string, @Body(new ZodPipe(storePreviewBody)) body: z.infer<typeof storePreviewBody>) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)) throw errors.notFound();
    return this.fees.previewForStore(storeId, body);
  }
}
