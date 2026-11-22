import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, RequireReauth, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { type Db, DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MediaService } from '../media/index.js';
import { AdminStoresService } from './admin-stores.service.js';
import { STORE_STATUSES } from './domain/state.js';
import { PaymentAccountService } from './payment-account.service.js';
import { StoreSettingsService } from './store-settings.service.js';
import {
  correctionSchema,
  decisionReasonSchema,
  documentAccessSchema,
  releaseAccountSchema,
} from './stores.schemas.js';
import { presentStore, uuidParam } from './stores.controllers.js';
import { StoresService } from './stores.service.js';
import { limitQuery } from '../../platform/http/pagination.js';

type In<T extends z.ZodType> = z.infer<T>;
const listQuery = z.strictObject({ status: z.enum(STORE_STATUSES).optional(), cursor: z.string().max(300).optional(), limit: limitQuery });

/** Fila de aprovação e decisões sobre lojas pelo admin (WB-103/104/218). A edição de dados e configuração é de `AdminStoreEditController` (R1.1, com motivo, versão e auditoria). Permissões na tabela única (SEC-021). */
@Controller('v1/admin/stores')
export class AdminStoresController {
  constructor(
    private readonly admin: AdminStoresService,
    private readonly stores: StoresService,
    private readonly settings: StoreSettingsService,
    private readonly accounts: PaymentAccountService,
    private readonly media: MediaService,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  private present(store: Awaited<ReturnType<StoresService['getStore']>>) {
    return presentStore({ stores: this.stores, media: this.media, db: this.db }, store, 'admin');
  }

  @AdminOnly('stores:read')
  @Get()
  list(@Query(new ZodPipe(listQuery)) query: In<typeof listQuery>) {
    return this.admin.list(query);
  }

  @AdminOnly('stores:read')
  @Get(':storeId')
  async detail(@Param('storeId') storeId: string) {
    const detail = await this.admin.detail(uuidParam(storeId));
    return {
      store: await this.present(detail.store),
      owner: detail.owner,
      documents: detail.documents.map((d) => ({ id: d.id, kind: d.kind, uploadedAt: d.createdAt.toISOString(), current: d.supersededAt === null })),
      reviewItems: detail.items.map((i) => ({ item: i.item, reason: i.reason })),
      history: detail.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt.toISOString(), reason: h.reason })),
      paymentAccount: detail.account ? { status: detail.account.status, holderDocumentMasked: detail.account.holderDocumentMasked, holderMatchesStore: detail.account.holderMatchesStore } : null,
      sameDocument: detail.sameDocument,
      settings: await this.settings.present(detail.store),
    };
  }

  @AdminOnly('stores:documents')
  @HttpCode(200)
  @RateLimit({ name: 'doc-access', limit: 120, windowSeconds: 3600 })
  @Post(':storeId/documents/:documentId/access')
  async documentAccess(@Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Param('documentId') documentId: string, @Body(new ZodPipe(documentAccessSchema)) body: In<typeof documentAccessSchema>) {
    return this.admin.documentAccessUrl(uuidParam(storeId), uuidParam(documentId), body.reason, ctx);
  }

  @AdminOnly('stores:decide')
  @HttpCode(200)
  @Post(':storeId/approve')
  async approve(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string) {
    return this.present(await this.admin.approve(uuidParam(storeId), admin, ctx));
  }

  @AdminOnly('stores:decide')
  @HttpCode(200)
  @Post(':storeId/request-correction')
  async correction(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(correctionSchema)) body: In<typeof correctionSchema>) {
    return this.present(await this.admin.requestCorrection(uuidParam(storeId), admin, body.items, ctx));
  }

  @AdminOnly('stores:decide')
  @HttpCode(200)
  @Post(':storeId/reject')
  async reject(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(decisionReasonSchema)) body: In<typeof decisionReasonSchema>) {
    return this.present(await this.admin.reject(uuidParam(storeId), admin, body.reason, ctx));
  }

  @AdminOnly('stores:decide')
  @HttpCode(200)
  @Post(':storeId/suspend')
  async suspend(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(decisionReasonSchema)) body: In<typeof decisionReasonSchema>) {
    return this.present(await this.admin.suspend(uuidParam(storeId), admin, body.reason, ctx));
  }

  @AdminOnly('stores:decide')
  @HttpCode(200)
  @Post(':storeId/reactivate')
  async reactivate(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string) {
    return this.present(await this.admin.reactivate(uuidParam(storeId), admin, ctx));
  }

  /** WB-103 C7 / SEC-047: liberar conta com titular divergente exige TOTP vigente, motivo e auditoria. */
  @AdminOnly('stores:decide')
  @RequireReauth()
  @HttpCode(204)
  @Post(':storeId/payment-account/release')
  async release(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(releaseAccountSchema)) body: In<typeof releaseAccountSchema>): Promise<void> {
    await this.accounts.release(uuidParam(storeId), admin.userId, body.reason, ctx);
  }

  @AdminOnly('stores:decide')
  @HttpCode(200)
  @Post(':storeId/data-review/:decision')
  async dataReview(@Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Param('decision') decision: string, @Body(new ZodPipe(decisionReasonSchema)) body: In<typeof decisionReasonSchema>) {
    if (decision !== 'approve' && decision !== 'reject') throw errors.notFound();
    return this.present(await this.admin.decideDataReview(uuidParam(storeId), decision === 'approve', body.reason, ctx));
  }
}
