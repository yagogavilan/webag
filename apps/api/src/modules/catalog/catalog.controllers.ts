import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, CurrentViewAs, StorePermission, ViewAs, type Principal, type RequestContext, type ViewAsContext } from '../../platform/auth/decorators.js';
import { memberHasStorePermission } from '../../platform/auth/permissions.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { IdempotencyService, parseIdempotencyKey } from '../idempotency/index.js';
import { PrincipalService } from '../identity/index.js';
import { StoresService, uuidParam } from '../stores/index.js';
import { adminProductsQuerySchema, bulkBatchesQuerySchema, bulkSchema, createDraftSchema, createProductSchema, draftsBatchSchema, draftsQuerySchema, importQuerySchema, listProductsSchema, moderateSchema, moderationTermSchema, productMetricsQuerySchema, quickPublishSchema, sectionOrderSchema, sectionSchema, setImagesSchema, setVariantsSchema, stockAdjustSchema, tableQuerySchema, updateProductSchema } from './catalog.schemas.js';
import { CatalogService, type Variant } from './catalog.service.js';
import { etag, parseIfMatch } from './domain/version.js';
import { ProductDraftsService } from './drafts.service.js';
import { ModerationService } from './moderation.service.js';
import { ProductMetricsService } from './product-metrics.service.js';
import { ProductTableService } from './product-table.service.js';

type In<T extends z.ZodType> = z.infer<T>;

/** Catálogo da loja: funcionário precisa da permissão `catalog`; não-membro recebe 404 (SEC-020). */
@Controller('v1/stores/:storeId')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly drafts: ProductDraftsService,
    private readonly table: ProductTableService,
    private readonly stores: StoresService,
    private readonly principals: PrincipalService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private store(storeId: string) {
    return this.stores.getStore(uuidParam(storeId));
  }

  private actor(principal: Principal, ctx: RequestContext) {
    return { userId: principal.userId, ctx };
  }

  /** Escrita que o cliente repete em 3G: a chave é OBRIGATÓRIA (400 sem ela). */
  private requiredKey(raw: string | undefined): string {
    return parseIdempotencyKey(raw, true)!;
  }

  // ------------------------------------------------- cadastro rápido (v1.1 R1.2)

  @StorePermission('catalog')
  @Get('catalog/quick-start')
  async quickStart(@Param('storeId') storeId: string) {
    return this.drafts.quickStart(await this.store(storeId));
  }

  @StorePermission('catalog')
  @Get('product-drafts')
  async listDrafts(@Param('storeId') storeId: string, @Query(new ZodPipe(draftsQuerySchema)) query: In<typeof draftsQuerySchema>) {
    return this.drafts.list(await this.store(storeId), query);
  }

  @StorePermission('catalog')
  @RateLimit({ name: 'product-draft-create', limit: 240, windowSeconds: 3600 })
  @Post('product-drafts')
  async createDraft(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(createDraftSchema)) body: In<typeof createDraftSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.drafts.createDraft(await this.store(storeId), this.actor(principal, ctx), body, this.requiredKey(idempotencyKey));
  }

  @StorePermission('catalog')
  @Post('product-drafts/batch')
  async createDraftsBatch(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(draftsBatchSchema)) body: In<typeof draftsBatchSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.drafts.createBatch(await this.store(storeId), this.actor(principal, ctx), body, this.requiredKey(idempotencyKey));
  }

  /** `products/table` ANTES de `products/:productId` (A2): senão "table" cairia em `{productId}` e viraria 404. */
  @ViewAs('listProductTable')
  @StorePermission('member')
  @Get('products/table')
  async productTable(
    @CurrentPrincipal() principal: Principal,
    @CurrentViewAs() viewAs: ViewAsContext | null,
    @Param('storeId') storeId: string,
    @Query(new ZodPipe(tableQuerySchema)) query: In<typeof tableQuerySchema>,
  ) {
    // Qualquer membro lê; a comissão só vai a quem gerencia o catálogo e nunca na "Ver como".
    const store = await this.store(storeId);
    const member = viewAs ? null : await this.principals.storeMembership(principal.userId, store.id);
    const includeReceive = member !== null && memberHasStorePermission(member, 'catalog');
    return this.table.list(store, query, includeReceive);
  }

  @StorePermission('catalog')
  @Post('products/:productId/duplicate')
  async duplicate(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.drafts.duplicate(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId), this.requiredKey(idempotencyKey));
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/quick-publish')
  async quickPublish(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body(new ZodPipe(quickPublishSchema)) body: In<typeof quickPublishSchema>,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const version = parseIfMatch(ifMatch);
    const product = await this.drafts.quickPublish(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId), body, version, this.requiredKey(idempotencyKey));
    res.setHeader('ETag', etag(product.version));
    return product;
  }

  // ------------------------------------------------------------------ produtos

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
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(createProductSchema)) body: In<typeof createProductSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw errors.validation([{ field: 'Idempotency-Key', message: 'Use de 8 a 80 caracteres (letras, números, - e _).' }]);
    return this.catalog.create(await this.store(storeId), this.actor(principal, ctx), body, idempotencyKey ?? null);
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
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Query(new ZodPipe(importQuerySchema)) query: In<typeof importQuerySchema>,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (typeof body !== 'string') throw errors.validation([{ field: 'file', message: 'Envie o arquivo CSV com Content-Type text/csv.' }]);
    const store = await this.store(storeId);
    const actor = this.actor(principal, ctx);
    // A leitura da planilha (categorias, parâmetros, teto) acontece ANTES de qualquer transação (DT-094).
    const prepared = await this.catalog.prepareImport(store, body);
    // I9: só o commit muda dados; a prévia não precisa de chave.
    if (query.mode !== 'commit') return this.catalog.importPreview(store, prepared);
    const key = parseIdempotencyKey(idempotencyKey);
    if (!key) return this.catalog.commitImport(store, actor, prepared, query.onExisting);
    // SEC-213: chave, efeito e resposta no mesmo commit; o escopo leva loja e ator. Erro (teto, versão) desfaz tudo e libera a chave.
    const result = await this.idempotency.runInTransaction(`import:${store.id}:${principal.userId}`, key, { csv: body, ...query }, (tx) => this.catalog.commitImport(store, actor, prepared, query.onExisting, tx));
    await this.catalog.afterImport(store, result);
    return result;
  }

  /**
   * Ação em massa. `price_adjust` SEM `dryRun` (B2, D17, SEC-208): `Idempotency-Key` e `expectedVersions` de TODOS os itens são exigidos aqui no servidor e a execução
   * é `runInTransaction` (chave, versões, efeito e resposta no mesmo commit). As demais ações são estados absolutos (repetir é seguro) e seguem como antes.
   */
  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/bulk')
  async bulk(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(bulkSchema)) body: In<typeof bulkSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const store = await this.store(storeId);
    const actor = this.actor(principal, ctx);
    const key = parseIdempotencyKey(idempotencyKey);
    if (body.action.type !== 'price_adjust' || body.dryRun) {
      return this.idempotency.run(`bulk:${store.id}`, key, body, () => this.catalog.bulk(store, actor, body));
    }
    if (!key) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Chave de idempotência obrigatória', { detail: 'O reajuste de preço em massa exige o header Idempotency-Key (gerado uma vez por clique em "Aplicar").' });
    const covered = new Set((body.expectedVersions ?? []).map((e) => e.productId.toLowerCase()));
    const missing = [...new Set(body.productIds.map((id) => id.toLowerCase()))].filter((id) => !covered.has(id));
    if (missing.length > 0) throw new AppError(400, 'EXPECTED_VERSIONS_REQUIRED', 'Versões dos produtos obrigatórias', { detail: 'Envie `expectedVersions` com a versão de cada produto, como veio na prévia.', errors: missing.map((id) => ({ field: 'expectedVersions', message: id })) });
    const result = await this.idempotency.runInTransaction(`bulk:${store.id}:${principal.userId}`, key, body, (tx) => this.catalog.bulk(store, actor, body, tx));
    if (result.changed > 0) await this.catalog.afterBulk(store, body.productIds);
    return result;
  }

  /** WB-377 C7. Declarada ANTES de `products/:productId` (A2: segmento estático não pode cair no parâmetro). */
  @StorePermission('catalog')
  @Get('products/bulk-batches')
  async bulkBatches(@Param('storeId') storeId: string, @Query(new ZodPipe(bulkBatchesQuerySchema)) query: In<typeof bulkBatchesQuerySchema>) {
    return this.catalog.listBulkBatches((await this.store(storeId)).id, query);
  }

  /** WB-377 C4 / BK-08: desfazer o reajuste em até 10 min (repetir devolve `alreadyUndone`). Também antes de `products/:productId`. */
  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/bulk/:batchId/undo')
  async undoBulk(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Param('batchId') batchId: string) {
    return this.catalog.undoBulkBatch(await this.store(storeId), this.actor(principal, ctx), uuidParam(batchId));
  }

  @ViewAs('getProduct')
  @StorePermission('catalog')
  @Get('products/:productId')
  async get(@Res({ passthrough: true }) res: Response, @Param('storeId') storeId: string, @Param('productId') productId: string) {
    const product = await this.catalog.get(await this.store(storeId), uuidParam(productId));
    res.setHeader('ETag', etag(product.version));
    return product;
  }

  @StorePermission('catalog')
  @Patch('products/:productId')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body(new ZodPipe(updateProductSchema)) body: In<typeof updateProductSchema>,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.catalog.update(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId), body, parseIfMatch(ifMatch));
  }

  @StorePermission('catalog')
  @Put('products/:productId/variants')
  async setVariants(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body(new ZodPipe(setVariantsSchema)) body: In<typeof setVariantsSchema>,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.catalog.setVariants(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId), body, parseIfMatch(ifMatch));
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/variants/:variantId/stock')
  async stock(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body(new ZodPipe(stockAdjustSchema)) body: In<typeof stockAdjustSchema>,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const store = await this.store(storeId);
    const ids = { productId: uuidParam(productId), variantId: uuidParam(variantId) };
    const version = parseIfMatch(ifMatch);
    const actor = this.actor(principal, ctx);
    const key = parseIdempotencyKey(idempotencyKey);
    const withEtag = <T extends { productVersion: number } | null | undefined>(view: T): T => {
      if (view && typeof view.productVersion === 'number') res.setHeader('ETag', etag(view.productVersion)); // resposta guardada antes da R1.3 (24 h) não tem o campo
      return view;
    };
    if (!key) return withEtag(await this.catalog.adjustStock(store, actor, ids.productId, ids.variantId, body, version));
    // SEC-218: ajuste relativo (`delta`) repetido não pode somar duas vezes. Chave, efeito e resposta no mesmo commit; o escopo leva loja e ator.
    this.catalog.assertWritable(store);
    const context = await this.catalog.presentContext(store);
    const done: { changed: { variant: Variant; available: number } | null } = { changed: null };
    const view = await this.idempotency.runInTransaction(`stock:${store.id}:${principal.userId}`, key, { ...ids, ...body, ifMatch: version }, async (tx) => {
      const result = await this.catalog.adjustStockIn(tx, store, actor, ids.productId, ids.variantId, body, version, context);
      done.changed = result.changed;
      return result.view ?? null;
    });
    if (done.changed) await this.catalog.afterStockAdjust(store, ids.productId, done.changed);
    return withEtag(view);
  }

  @StorePermission('catalog')
  @Put('products/:productId/images')
  async setImages(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body(new ZodPipe(setImagesSchema)) body: In<typeof setImagesSchema>,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.catalog.setImages(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId), body.imageIds, parseIfMatch(ifMatch));
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/publish')
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.catalog.publish(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId), parseIfMatch(ifMatch));
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/pause')
  async pause(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.catalog.pause(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId));
  }

  @StorePermission('catalog')
  @HttpCode(200)
  @Post('products/:productId/resume')
  async resume(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.catalog.resume(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId));
  }

  @StorePermission('catalog')
  @HttpCode(204)
  @Delete('products/:productId')
  async archive(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Param('productId') productId: string): Promise<void> {
    await this.catalog.archive(await this.store(storeId), this.actor(principal, ctx), uuidParam(productId));
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

/** WB-379 C2: tempo de cadastro de produto (mediana e p90 por `via` ou loja, mínimo de 5). Super admin, operação e financeiro (`reports:operations`). */
@Controller('v1/admin')
export class AdminProductMetricsController {
  constructor(private readonly metrics: ProductMetricsService) {}

  @AdminOnly('reports:operations')
  @Get('metrics/product-creation')
  report(@Query(new ZodPipe(productMetricsQuerySchema)) query: In<typeof productMetricsQuerySchema>) {
    return this.metrics.report(query);
  }
}
