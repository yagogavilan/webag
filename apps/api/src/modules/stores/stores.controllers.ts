import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, Public, RequireReauth, Roles, StorePermission, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { maskDocument } from './domain/document.js';
import { PaymentAccountService } from './payment-account.service.js';
import { StoreSettingsService, type Actor } from './store-settings.service.js';
import { GEOCODING_PROVIDER, type GeocodingProvider } from './geocoding.js';
import {
  acceptStaffSchema,
  attachDocumentSchema,
  connectCallbackSchema,
  createStoreSchema,
  deliverySchema,
  exchangePolicySchema,
  holidaysSchema,
  hoursSchema,
  inviteStaffSchema,
  lowStockSchema,
  memberPermissionsSchema,
  pauseSchema,
  pickupSchema,
  previewSchema,
  profileSchema,
} from './stores.schemas.js';
import { StoresService, type Store } from './stores.service.js';
import { TeamService } from './team.service.js';
import { Inject } from '@nestjs/common';
import { Db, DRIZZLE } from '../../platform/database/database.module.js';
import { eq } from 'drizzle-orm';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uuidParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

type In<T extends z.ZodType> = z.infer<T>;

/** Apresentação da loja ao painel: CPF/CNPJ inteiro só para dono e admin; funcionário vê mascarado (SEC-023). */
export async function presentStore(
  services: { stores: StoresService; media: MediaService; db: Db },
  store: Store,
  viewer: 'owner' | 'staff' | 'admin',
) {
  const [extra, logo, cover, open] = await Promise.all([
    services.stores.extraCategoryIds(store.id),
    store.logoAssetId ? services.db.select().from(mediaAssets).where(eq(mediaAssets.id, store.logoAssetId)) : Promise.resolve([]),
    store.coverAssetId ? services.db.select().from(mediaAssets).where(eq(mediaAssets.id, store.coverAssetId)) : Promise.resolve([]),
    services.stores.openReviewItems(store.id),
  ]);
  return {
    id: store.id,
    status: store.status,
    documentType: store.documentType,
    document: viewer === 'staff' ? maskDocument(store.documentNumber) : store.documentNumber,
    legalName: store.legalName,
    name: store.name,
    description: store.description,
    phone: store.phone,
    whatsapp: store.whatsapp,
    mainCategoryId: store.mainCategoryId,
    extraCategoryIds: extra,
    address: store.addressCep
      ? { cep: store.addressCep, street: store.addressStreet, number: store.addressNumber, complement: store.addressComplement, neighborhood: store.addressNeighborhood, city: store.addressCityName, state: store.addressState, lat: store.lat, lng: store.lng }
      : null,
    logo: services.media.publicVariants(logo[0] ?? null),
    cover: services.media.publicVariants(cover[0] ?? null),
    pendingReview: store.pendingChanges !== null,
    reviewItems: open.map((item) => ({ item: item.item, reason: item.reason })),
    submittedAt: store.submittedAt?.toISOString() ?? null,
    // O motivo de recusa/suspensão é do lojista saber; o de aprovação não é.
    decisionReason: store.status === 'rejected' || store.status === 'suspended' ? (store.decisionReason ?? store.suspensionReason) : null,
    createdAt: store.createdAt.toISOString(),
  };
}

@Controller('v1')
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly settings: StoreSettingsService,
    private readonly media: MediaService,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  private present(store: Store, viewer: 'owner' | 'staff' | 'admin' = 'owner') {
    return presentStore({ stores: this.stores, media: this.media, db: this.db }, store, viewer);
  }

  private owner(principal: Principal): Actor {
    return { userId: principal.userId, kind: 'merchant' };
  }

  // ------------------------------------------------------------- onboarding

  @Roles('merchant')
  @RateLimit({ name: 'store-create', limit: 10, windowSeconds: 3600 })
  @Post('stores')
  async create(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(createStoreSchema)) body: In<typeof createStoreSchema>) {
    return this.present(await this.stores.create(principal, body));
  }

  @Roles('merchant')
  @Get('stores/mine')
  async mine(@CurrentPrincipal() principal: Principal) {
    const mine = await this.stores.listMine(principal.userId);
    return { data: await Promise.all(mine.map(async (store) => ({ ...(await this.present(store, store.role === 'owner' ? 'owner' : 'staff')), role: store.role }))), nextCursor: null };
  }

  @StorePermission('member')
  @Get('stores/:storeId')
  async get(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string) {
    const store = await this.stores.getStore(uuidParam(storeId));
    const isOwner = store.ownerUserId === principal.userId;
    return { ...(await this.present(store, isOwner ? 'owner' : 'staff')), ...(isOwner ? { settings: await this.settings.present(store) } : {}) };
  }

  @StorePermission('settings')
  @Patch('stores/:storeId/profile')
  async profile(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(profileSchema)) body: In<typeof profileSchema>,
  ) {
    const store = await this.stores.getStore(uuidParam(storeId));
    const { store: updated, pendingReview } = await this.stores.updateProfile(store, body, this.owner(principal), ctx);
    return { ...(await this.present(updated)), pendingReview };
  }

  @StorePermission('settings')
  @Get('stores/:storeId/onboarding')
  async onboarding(@Param('storeId') storeId: string) {
    const store = await this.stores.getStore(uuidParam(storeId));
    const missing = await this.stores.missingForSubmit(store);
    return { status: store.status, complete: missing.length === 0, missing, paymentAccount: await this.stores.paymentAccountStatus(store.id), history: (await this.stores.statusHistory(store.id)).map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt.toISOString() })) };
  }

  @StorePermission('settings')
  @Get('stores/:storeId/documents')
  async documents(@Param('storeId') storeId: string) {
    return { data: await this.stores.listDocuments(uuidParam(storeId)), nextCursor: null };
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Post('stores/:storeId/documents')
  async attach(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Body(new ZodPipe(attachDocumentSchema)) body: In<typeof attachDocumentSchema>): Promise<void> {
    const store = await this.stores.getStore(uuidParam(storeId));
    await this.stores.attachDocument(store, body.kind, body.uploadId, principal);
  }

  @StorePermission('settings')
  @HttpCode(200)
  @Post('stores/:storeId/submit')
  async submit(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string) {
    const store = await this.stores.getStore(uuidParam(storeId));
    return this.present(await this.stores.submit(store, principal.userId));
  }

  // ------------------------------------------------------------ configuração

  @StorePermission('settings')
  @Get('stores/:storeId/settings')
  async getSettings(@Param('storeId') storeId: string) {
    return this.settings.present(await this.stores.getStore(uuidParam(storeId)));
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Put('stores/:storeId/hours')
  async hours(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(hoursSchema)) body: In<typeof hoursSchema>): Promise<void> {
    await this.settings.setHours(await this.stores.getStore(uuidParam(storeId)), body.days, this.owner(principal), ctx);
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Put('stores/:storeId/holidays')
  async holidays(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(holidaysSchema)) body: In<typeof holidaysSchema>): Promise<void> {
    await this.settings.setHolidays(await this.stores.getStore(uuidParam(storeId)), body.holidays, this.owner(principal), ctx);
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Post('stores/:storeId/pause')
  async pause(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(pauseSchema)) body: In<typeof pauseSchema>): Promise<void> {
    await this.settings.pause(await this.stores.getStore(uuidParam(storeId)), body.kind, this.owner(principal), ctx);
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Delete('stores/:storeId/pause')
  async resume(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string): Promise<void> {
    await this.settings.resume(await this.stores.getStore(uuidParam(storeId)), this.owner(principal), ctx);
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Put('stores/:storeId/delivery')
  async delivery(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(deliverySchema)) body: In<typeof deliverySchema>): Promise<void> {
    await this.settings.setDelivery(await this.stores.getStore(uuidParam(storeId)), body, this.owner(principal), ctx);
  }

  @StorePermission('settings')
  @HttpCode(200)
  @RateLimit({ name: 'delivery-preview', limit: 60, windowSeconds: 600 })
  @Post('stores/:storeId/delivery/preview')
  async preview(@Param('storeId') storeId: string, @Body(new ZodPipe(previewSchema)) body: In<typeof previewSchema>) {
    return this.settings.preview(await this.stores.getStore(uuidParam(storeId)), body);
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Put('stores/:storeId/pickup')
  async pickup(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(pickupSchema)) body: In<typeof pickupSchema>): Promise<void> {
    await this.settings.setPickup(await this.stores.getStore(uuidParam(storeId)), { ...body, useStoreAddress: body.useStoreAddress }, this.owner(principal), ctx);
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Put('stores/:storeId/exchange-policy')
  async exchange(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(exchangePolicySchema)) body: In<typeof exchangePolicySchema>): Promise<void> {
    await this.settings.setExchangePolicy(await this.stores.getStore(uuidParam(storeId)), body, this.owner(principal), ctx);
  }

  @StorePermission('settings')
  @HttpCode(204)
  @Put('stores/:storeId/low-stock')
  async lowStock(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(lowStockSchema)) body: In<typeof lowStockSchema>): Promise<void> {
    await this.settings.setLowStockThreshold(await this.stores.getStore(uuidParam(storeId)), body.threshold, this.owner(principal), ctx);
  }
}

@Controller('v1/cep')
export class CepController {
  constructor(@Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider) {}

  /** WB-051 C3: autocompleta rua/bairro/cidade e a coordenada. Autenticado e com limite (usa serviço externo). */
  @Roles('merchant')
  @RateLimit({ name: 'cep-lookup', limit: 60, windowSeconds: 600 })
  @Get(':cep')
  async lookup(@Param('cep') cep: string) {
    if (!/^\d{5}-?\d{3}$/.test(cep)) throw errors.validation([{ field: 'cep', message: 'CEP inválido.' }]);
    const found = await this.geocoding.lookup(cep.replace('-', '')).catch(() => {
      throw errors.unprocessable('CEP_LOOKUP_UNAVAILABLE', 'Serviço de CEP indisponível', { detail: 'Preencha o endereço à mão.' });
    });
    if (!found) throw errors.notFound('CEP não encontrado.');
    return found;
  }
}

@Controller('v1/stores/:storeId')
export class StorePaymentController {
  constructor(
    private readonly stores: StoresService,
    private readonly accounts: PaymentAccountService,
  ) {}

  @StorePermission('payment_account')
  @Get('payment-account')
  async view(@Param('storeId') storeId: string) {
    return this.accounts.view(uuidParam(storeId));
  }

  @StorePermission('payment_account')
  @RequireReauth()
  @HttpCode(200)
  @RateLimit({ name: 'payment-connect', limit: 20, windowSeconds: 3600 })
  @Post('payment-account/connect')
  async connect(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string) {
    return this.accounts.startConnect(await this.stores.getStore(uuidParam(storeId)), principal);
  }

  @StorePermission('payment_account')
  @HttpCode(200)
  @RateLimit({ name: 'payment-callback', limit: 20, windowSeconds: 3600 })
  @Post('payment-account/callback')
  async callback(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body(new ZodPipe(connectCallbackSchema)) body: In<typeof connectCallbackSchema>) {
    return this.accounts.completeConnect(await this.stores.getStore(uuidParam(storeId)), principal, body, ctx);
  }

  @StorePermission('payment_account')
  @RequireReauth()
  @HttpCode(204)
  @Delete('payment-account')
  async disconnect(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string): Promise<void> {
    await this.accounts.disconnect(await this.stores.getStore(uuidParam(storeId)), principal, ctx);
  }
}

@Controller('v1')
export class StoreTeamController {
  constructor(
    private readonly stores: StoresService,
    private readonly team: TeamService,
  ) {}

  @StorePermission('team')
  @Get('stores/:storeId/members')
  async members(@Param('storeId') storeId: string) {
    return this.team.list(uuidParam(storeId));
  }

  @StorePermission('team')
  @RequireReauth()
  @RateLimit({ name: 'staff-invite', limit: 30, windowSeconds: 3600 })
  @Post('stores/:storeId/members/invitations')
  async invite(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Body(new ZodPipe(inviteStaffSchema)) body: In<typeof inviteStaffSchema>) {
    const invitation = await this.team.invite(await this.stores.getStore(uuidParam(storeId)), principal, body);
    return { invitationId: invitation.invitationId, expiresAt: invitation.expiresAt.toISOString() };
  }

  @StorePermission('team')
  @RequireReauth()
  @HttpCode(204)
  @Delete('stores/:storeId/members/invitations/:invitationId')
  async revoke(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('invitationId') invitationId: string): Promise<void> {
    await this.team.revokeInvitation(await this.stores.getStore(uuidParam(storeId)), principal, uuidParam(invitationId));
  }

  @StorePermission('team')
  @RequireReauth()
  @HttpCode(204)
  @Patch('stores/:storeId/members/:userId')
  async permissions(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('userId') userId: string, @Body(new ZodPipe(memberPermissionsSchema)) body: In<typeof memberPermissionsSchema>): Promise<void> {
    await this.team.setPermissions(await this.stores.getStore(uuidParam(storeId)), principal, uuidParam(userId), body.permissions);
  }

  @StorePermission('team')
  @RequireReauth()
  @HttpCode(204)
  @Delete('stores/:storeId/members/:userId')
  async remove(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('userId') userId: string): Promise<void> {
    await this.team.remove(await this.stores.getStore(uuidParam(storeId)), principal, uuidParam(userId));
  }

  @StorePermission('team')
  @Get('stores/:storeId/activity')
  async activity(@Param('storeId') storeId: string) {
    return { data: await this.team.activity(uuidParam(storeId)), nextCursor: null };
  }

  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'staff-invite-accept', limit: 20, windowSeconds: 900 })
  @Post('auth/store-invitations/accept')
  async accept(@Body(new ZodPipe(acceptStaffSchema)) body: In<typeof acceptStaffSchema>, @Ctx() ctx: RequestContext) {
    return this.team.accept(body, ctx);
  }
}
