import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, StorePermission, ViewAs, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { IdempotencyService, parseIdempotencyKey } from '../idempotency/index.js';
import { StoresService, uuidParam } from '../stores/index.js';
import { adminProductsQuerySchema, bulkSchema, createProductSchema, importQuerySchema, listProductsSchema, moderateSchema, moderationTermSchema, sectionOrderSchema, sectionSchema, setImagesSchema, setVariantsSchema, stockAdjustSchema, updateProductSchema } from './catalog.schemas.js';
import { CatalogService } from './catalog.service.js';
import { ModerationService } from './moderation.service.js';

type In<T extends z.ZodType> = z.infer<T>;

/** Catálogo da loja: funcionário precisa da permissão `catalog`; não-membro recebe 404 (SEC-020). */
@Controller('v1/stores/:storeId')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly stores: StoresService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private store(storeId: string) {
    return this.stores.getStore(uuidParam(storeId));
  }

  @ViewAs('listProducts')
  @StorePermission('catalog')
  @Get('products')
  async list(@Param('storeId') storeId: string, @Query(new ZodPipe(listProductsSchema)) query: In<typeof listProductsSchema>) {
    return this.catalog.list(await this.store(storeId), { ...query, lowStock: query.lowStock === 'true' });
  }

  @StorePermission('catalog')
  @RateLimit({ name: 'product-create', limit: 120, windowSeconds: 3600 })
  @Post('products')
  async create(
    @CurrentPrincipal() principal: Principal,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(createProductSchema)) body: In<typeof createProductSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw errors.validation([{ field: 'Idempotency-Key', message: 'Use de 8 a 80 caracteres (letras, números, - e _).' }]);
    return this.catalog.create(await this.store(storeId), { userId: principal.userId }, body, idempotencyKey ?? null);
  }

  @StorePermission('catalog')
  @Get('products/import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="modelo-produtos.csv"')
  importTemplate(): string {
    return this.catalog.importTemplate();
  }

  /** Corpo `text/csv` (até 1 MB, 500 linhas). `mode=preview` valida e resume; `mode=commit` cria as válidas como rascunho. */
  @StorePermission('catalog')
  @RateLimit({ name: 'product-import', limit: 20, windowSeconds: 3600 })
  @HttpCode(200)
  @Post('products/import')
  async importCsv(
    @CurrentPrincipal() principal: Principal,
    @Param('storeId') storeId: string,
    @Query(new ZodPipe(importQuerySchema)) query: In<typeof importQuerySchema>,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (typeof body !== 'string') throw errors.validation([{ field: 'file', message: 'Envie o arquivo CSV com Content-Type text/csv.' }]);
    const store = await this.store(storeId);
    const run = () => this.catalog.importCsv(store, { userId: principal.userId }, body, query.mode, query.onExisting);
    // I9: só o commit muda dados; a prévia não precisa de chave.
    if (query.mode !== 'commit') return run();
    return this.idempotency.run(`import:${store.id}`, parseIdempotencyKey(idempotencyKey), { csv: body, ...query }, run);
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/bulk')
  async bulk(
    @CurrentPrincipal() principal: Principal,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(bulkSchema)) body: In<typeof bulkSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const store = await this.store(storeId);
    return this.idempotency.run(`bulk:${store.id}`, parseIdempotencyKey(idempotencyKey), body, () => this.catalog.bulk(store, { userId: principal.userId }, body));
  }

  @ViewAs('getProduct')
  @StorePermission('catalog')
  @Get('products/:productId')
  async get(@Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.catalog.get(await this.store(storeId), uuidParam(productId));
  }

  @StorePermission('catalog')
  @Patch('products/:productId')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body(new ZodPipe(updateProductSchema)) body: In<typeof updateProductSchema>,
  ) {
    return this.catalog.update(await this.store(storeId), { userId: principal.userId }, uuidParam(productId), body);
  }

  @StorePermission('catalog')
  @Put('products/:productId/variants')
  async setVariants(
    @CurrentPrincipal() principal: Principal,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body(new ZodPipe(setVariantsSchema)) body: In<typeof setVariantsSchema>,
  ) {
    return this.catalog.setVariants(await this.store(storeId), { userId: principal.userId }, uuidParam(productId), body);
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/variants/:variantId/stock')
  async stock(
    @CurrentPrincipal() principal: Principal,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body(new ZodPipe(stockAdjustSchema)) body: In<typeof stockAdjustSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const store = await this.store(storeId);
    const ids = { productId: uuidParam(productId), variantId: uuidParam(variantId) };
    return this.idempotency.run(`stock:${store.id}`, parseIdempotencyKey(idempotencyKey), { ...ids, ...body }, () =>
      this.catalog.adjustStock(store, { userId: principal.userId }, ids.productId, ids.variantId, body),
    );
  }

  @StorePermission('catalog')
  @Put('products/:productId/images')
  async setImages(
    @CurrentPrincipal() principal: Principal,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body(new ZodPipe(setImagesSchema)) body: In<typeof setImagesSchema>,
  ) {
    return this.catalog.setImages(await this.store(storeId), { userId: principal.userId }, uuidParam(productId), body.imageIds);
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/publish')
  async publish(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.catalog.publish(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/pause')
  async pause(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.catalog.pause(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/resume')
  async resume(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.catalog.resume(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
  }

  @StorePermission('catalog')
  @HttpCode(204)
  @Delete('products/:productId')
  async archive(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('productId') productId: string): Promise<void> {
    await this.catalog.archive(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
  }

  // ------------------------------------------------------------------- seções

  @ViewAs('listSections')
  @StorePermission('catalog')
  @Get('sections')
  async sections(@Param('storeId') storeId: string) {
    return { data: await this.catalog.sections(await this.store(storeId)), nextCursor: null };
  }

  @StorePermission('catalog')
  @Post('sections')
  async createSection(@Param('storeId') storeId: string, @Body(new ZodPipe(sectionSchema)) body: In<typeof sectionSchema>) {
    return this.catalog.createSection(await this.store(storeId), body.name);
  }

  @StorePermission('catalog')
  @HttpCode(204)
  @Put('sections/order')
  async orderSections(@Param('storeId') storeId: string, @Body(new ZodPipe(sectionOrderSchema)) body: In<typeof sectionOrderSchema>): Promise<void> {
    await this.catalog.orderSections(await this.store(storeId), body.ids);
  }

  @StorePermission('catalog')
  @Patch('sections/:sectionId')
  async renameSection(@Param('storeId') storeId: string, @Param('sectionId') sectionId: string, @Body(new ZodPipe(sectionSchema)) body: In<typeof sectionSchema>) {
    return this.catalog.renameSection(await this.store(storeId), uuidParam(sectionId), body.name);
  }

  @StorePermission('catalog')
  @HttpCode(204)
  @Delete('sections/:sectionId')
  async deleteSection(@Param('storeId') storeId: string, @Param('sectionId') sectionId: string): Promise<void> {
    await this.catalog.deleteSection(await this.store(storeId), uuidParam(sectionId));
  }
}

/** Moderação de produtos e das duas listas (WB-107): só super admin e operação (RN-13). */
@Controller('v1/admin')
export class AdminModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @AdminOnly('products:read')
  @Get('products')
  async list(@Query(new ZodPipe(adminProductsQuerySchema)) query: In<typeof adminProductsQuerySchema>) {
    return this.moderation.list({ ...query, from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined });
  }

  @AdminOnly('products:moderate')
  @HttpCode(200)
  @Post('products/:productId/moderation')
  moderate(
    @CurrentPrincipal() principal: Principal,
    @Param('productId') productId: string,
    @Body(new ZodPipe(moderateSchema)) body: In<typeof moderateSchema>,
    @Ctx() ctx: RequestContext,
  ) {
    return this.moderation.moderate(principal, uuidParam(productId), body, ctx);
  }

  @AdminOnly('moderation:read')
  @Get('moderation/terms')
  async terms() {
    return { data: await this.moderation.terms(), nextCursor: null };
  }

  @AdminOnly('moderation:write')
  @Post('moderation/terms')
  addTerm(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(moderationTermSchema)) body: In<typeof moderationTermSchema>, @Ctx() ctx: RequestContext) {
    return this.moderation.addTerm(principal, body, ctx);
  }

  @AdminOnly('moderation:write')
  @HttpCode(204)
  @Delete('moderation/terms/:termId')
  async removeTerm(@Param('termId') termId: string, @Ctx() ctx: RequestContext): Promise<void> {
    await this.moderation.removeTerm(uuidParam(termId), ctx);
  }
}
