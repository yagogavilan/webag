import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, CurrentViewAs, Ctx, StorePermission, ViewAs, type Principal, type RequestContext, type ViewAsContext } from '../../platform/auth/decorators.js';
import { memberHasStorePermission } from '../../platform/auth/permissions.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { PrincipalService } from '../identity/index.js';
import { uuidParam } from '../stores/index.js';
import { StoreOrdersService } from './store-orders.service.js';
import { limitQuery } from '../../platform/http/pagination.js';

const listSchema = z.strictObject({
  scope: z.enum(['new', 'in_progress', 'history']).optional(),
  number: z.string().trim().regex(/^WB-[A-Za-z0-9]{5}$/).optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
});
const reasonSchema = z.strictObject({ reason: z.string().trim().min(3).max(200) });
const statusSchema = z.strictObject({
  // DEC-036: na entrega Webag a loja só chega a `ready_for_collection`; saída e entrega são da logística.
  status: z.enum(['in_preparation', 'ready_for_collection', 'ready_for_pickup', 'delivered']),
  pickupCode: z.string().regex(/^\d{4,6}$/).optional(),
  /** Só em `ready_for_collection` (WB-229 C2). */
  volumes: z.number().int().min(1).max(99).optional(),
  note: z.string().trim().max(100).optional(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderIdParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound('Pedido não encontrado.');
  return value;
};

const WRITE = { name: 'store-order-write', limit: 600, windowSeconds: 3600 };

/**
 * Painel de pedidos da loja (WB-067 a WB-072). Exige a permissão `orders` (dono ou funcionário com ela); não-membro
 * recebe 404. Valores (preços, comissão) só com `sales_values` (RN-13).
 */
@Controller('v1/stores/:storeId/orders')
export class StoreOrdersController {
  constructor(
    private readonly orders: StoreOrdersService,
    private readonly principals: PrincipalService,
  ) {}

  private async showValues(userId: string, storeId: string): Promise<boolean> {
    const member = await this.principals.storeMembership(userId, storeId);
    return member !== null && memberHasStorePermission(member, 'sales_values');
  }

  @ViewAs('listStoreOrders')
  @StorePermission('orders')
  @Get()
  async list(@CurrentPrincipal() p: Principal, @CurrentViewAs() view: ViewAsContext | null, @Param('storeId') storeId: string, @Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    const id = uuidParam(storeId);
    // WB-352: na visão a apresentação vem de `req.viewAs` (valores visíveis, nenhuma ação), nunca da associação do admin à loja.
    if (view) return this.orders.list(id, { ...query, number: query.number }, true, 'view_as');
    return this.orders.list(id, { ...query, number: query.number }, await this.showValues(p.userId, id));
  }

  @ViewAs('countStoreOrders')
  @StorePermission('orders')
  @Get('counts')
  counts(@Param('storeId') storeId: string) {
    return this.orders.counts(uuidParam(storeId));
  }

  @ViewAs('getStoreOrder')
  @StorePermission('orders')
  @Get(':orderId')
  async get(@CurrentPrincipal() p: Principal, @CurrentViewAs() view: ViewAsContext | null, @Param('storeId') storeId: string, @Param('orderId') orderId: string) {
    const id = uuidParam(storeId);
    if (view) return this.orders.get(id, orderIdParam(orderId), true, 'view_as');
    return this.orders.get(id, orderIdParam(orderId), await this.showValues(p.userId, id));
  }

  @StorePermission('orders')
  @Get(':orderId/ticket')
  ticket(@Param('storeId') storeId: string, @Param('orderId') orderId: string) {
    return this.orders.ticket(uuidParam(storeId), orderIdParam(orderId));
  }

  @StorePermission('orders')
  @HttpCode(200)
  @RateLimit(WRITE)
  @Post(':orderId/accept')
  async accept(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('orderId') orderId: string) {
    const id = uuidParam(storeId);
    await this.orders.accept(id, orderIdParam(orderId), p.userId);
    return this.orders.get(id, orderId, await this.showValues(p.userId, id));
  }

  @StorePermission('orders')
  @HttpCode(200)
  @RateLimit(WRITE)
  @Post(':orderId/refuse')
  async refuse(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('orderId') orderId: string, @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>) {
    const id = uuidParam(storeId);
    await this.orders.refuse(id, orderIdParam(orderId), p.userId, body.reason);
    return this.orders.get(id, orderId, await this.showValues(p.userId, id));
  }

  @StorePermission('orders')
  @HttpCode(200)
  @RateLimit(WRITE)
  @Post(':orderId/status')
  async status(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('orderId') orderId: string, @Body(new ZodPipe(statusSchema)) body: z.infer<typeof statusSchema>) {
    const id = uuidParam(storeId);
    await this.orders.advance(id, orderIdParam(orderId), p.userId, body.status, body.pickupCode, { volumes: body.volumes, note: body.note });
    return this.orders.get(id, orderId, await this.showValues(p.userId, id));
  }

  /** SEC-143: a loja confirma que recebeu de volta a mercadoria da entrega não realizada; só então o pedido é cancelado e estornado. */
  @StorePermission('orders')
  @HttpCode(200)
  @RateLimit(WRITE)
  @Post(':orderId/return-received')
  async returnReceived(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('orderId') orderId: string, @Ctx() ctx: RequestContext) {
    const id = uuidParam(storeId);
    await this.orders.confirmReturnReceived(id, orderIdParam(orderId), p.userId, ctx);
    return this.orders.get(id, orderId, await this.showValues(p.userId, id));
  }

  /** BUG-015: a loja aprova o pedido de cancelamento do cliente (cancela e estorna) ou recusa com motivo. */
  @StorePermission('orders')
  @HttpCode(200)
  @RateLimit(WRITE)
  @Post(':orderId/cancel-request/accept')
  async acceptCancelRequest(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('orderId') orderId: string) {
    const id = uuidParam(storeId);
    await this.orders.decideCancelRequest(id, orderIdParam(orderId), p.userId, 'approved', null);
    return this.orders.get(id, orderId, await this.showValues(p.userId, id));
  }

  @StorePermission('orders')
  @HttpCode(200)
  @RateLimit(WRITE)
  @Post(':orderId/cancel-request/reject')
  async rejectCancelRequest(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('orderId') orderId: string, @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>) {
    const id = uuidParam(storeId);
    await this.orders.decideCancelRequest(id, orderIdParam(orderId), p.userId, 'refused', body.reason);
    return this.orders.get(id, orderId, await this.showValues(p.userId, id));
  }

  @StorePermission('orders')
  @HttpCode(200)
  @RateLimit(WRITE)
  @Post(':orderId/cancel')
  async cancel(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('orderId') orderId: string, @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>) {
    const id = uuidParam(storeId);
    await this.orders.cancel(id, orderIdParam(orderId), p.userId, body.reason);
    return this.orders.get(id, orderId, await this.showValues(p.userId, id));
  }
}
