var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { Ctx, CurrentPrincipal, Public, RequireReauth, Roles, StorePermission } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { maskDocument } from './domain/document.js';
import { PaymentAccountService } from './payment-account.service.js';
import { StoreSettingsService } from './store-settings.service.js';
import { GEOCODING_PROVIDER } from './geocoding.js';
import { acceptStaffSchema, attachDocumentSchema, connectCallbackSchema, createStoreSchema, deliverySchema, exchangePolicySchema, holidaysSchema, hoursSchema, inviteStaffSchema, lowStockSchema, memberPermissionsSchema, pauseSchema, pickupSchema, previewSchema, profileSchema, } from './stores.schemas.js';
import { StoresService } from './stores.service.js';
import { TeamService } from './team.service.js';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { eq } from 'drizzle-orm';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uuidParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
/** Apresentação da loja ao painel: CPF/CNPJ inteiro só para dono e admin; funcionário vê mascarado (SEC-023). */
export async function presentStore(services, store, viewer) {
    const [extra, logo, cover, open, commission] = await Promise.all([
        services.stores.extraCategoryIds(store.id),
        store.logoAssetId ? services.db.select().from(mediaAssets).where(eq(mediaAssets.id, store.logoAssetId)) : Promise.resolve([]),
        store.coverAssetId ? services.db.select().from(mediaAssets).where(eq(mediaAssets.id, store.coverAssetId)) : Promise.resolve([]),
        services.stores.openReviewItems(store.id),
        // RN-13: o financeiro (comissão) é do dono e do admin; o funcionário não vê.
        viewer === 'staff' ? Promise.resolve(null) : services.stores.commissionView(store.id),
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
        /** Comissão efetiva (%) e origem; `commissionCategories` só quando a loja não tem taxa própria. Funcionário: nulos. */
        commissionPct: commission?.pct ?? null,
        commissionSource: commission?.source ?? null,
        commissionCategories: commission?.categories ?? [],
    };
}
let StoresController = class StoresController {
    stores;
    settings;
    media;
    db;
    constructor(stores, settings, media, db) {
        this.stores = stores;
        this.settings = settings;
        this.media = media;
        this.db = db;
    }
    present(store, viewer = 'owner') {
        return presentStore({ stores: this.stores, media: this.media, db: this.db }, store, viewer);
    }
    owner(principal) {
        return { userId: principal.userId, kind: 'merchant' };
    }
    // ------------------------------------------------------------- onboarding
    async create(principal, body) {
        return this.present(await this.stores.create(principal, body));
    }
    async mine(principal) {
        const mine = await this.stores.listMine(principal.userId);
        return { data: await Promise.all(mine.map(async (store) => ({ ...(await this.present(store, store.role === 'owner' ? 'owner' : 'staff')), role: store.role }))), nextCursor: null };
    }
    async get(principal, storeId) {
        const store = await this.stores.getStore(uuidParam(storeId));
        const isOwner = store.ownerUserId === principal.userId;
        return { ...(await this.present(store, isOwner ? 'owner' : 'staff')), ...(isOwner ? { settings: await this.settings.present(store) } : {}) };
    }
    async profile(principal, ctx, storeId, body) {
        const store = await this.stores.getStore(uuidParam(storeId));
        const { store: updated, pendingReview } = await this.stores.updateProfile(store, body, this.owner(principal), ctx);
        return { ...(await this.present(updated)), pendingReview };
    }
    async onboarding(storeId) {
        const store = await this.stores.getStore(uuidParam(storeId));
        const missing = await this.stores.missingForSubmit(store);
        return { status: store.status, complete: missing.length === 0, missing, paymentAccount: await this.stores.paymentAccountStatus(store.id), history: (await this.stores.statusHistory(store.id)).map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt.toISOString() })) };
    }
    async documents(storeId) {
        return { data: await this.stores.listDocuments(uuidParam(storeId)), nextCursor: null };
    }
    async attach(principal, storeId, body) {
        const store = await this.stores.getStore(uuidParam(storeId));
        await this.stores.attachDocument(store, body.kind, body.uploadId, principal);
    }
    async submit(principal, storeId) {
        const store = await this.stores.getStore(uuidParam(storeId));
        return this.present(await this.stores.submit(store, principal.userId));
    }
    // ------------------------------------------------------------ configuração
    async getSettings(storeId) {
        return this.settings.present(await this.stores.getStore(uuidParam(storeId)));
    }
    async hours(principal, ctx, storeId, body) {
        await this.settings.setHours(await this.stores.getStore(uuidParam(storeId)), body.days, this.owner(principal), ctx);
    }
    async holidays(principal, ctx, storeId, body) {
        await this.settings.setHolidays(await this.stores.getStore(uuidParam(storeId)), body.holidays, this.owner(principal), ctx);
    }
    async pause(principal, ctx, storeId, body) {
        await this.settings.pause(await this.stores.getStore(uuidParam(storeId)), body.kind, this.owner(principal), ctx);
    }
    async resume(principal, ctx, storeId) {
        await this.settings.resume(await this.stores.getStore(uuidParam(storeId)), this.owner(principal), ctx);
    }
    async delivery(principal, ctx, storeId, body) {
        await this.settings.setDelivery(await this.stores.getStore(uuidParam(storeId)), body, this.owner(principal), ctx);
    }
    async preview(storeId, body) {
        return this.settings.preview(await this.stores.getStore(uuidParam(storeId)), body);
    }
    async pickup(principal, ctx, storeId, body) {
        await this.settings.setPickup(await this.stores.getStore(uuidParam(storeId)), { ...body, useStoreAddress: body.useStoreAddress }, this.owner(principal), ctx);
    }
    async exchange(principal, ctx, storeId, body) {
        await this.settings.setExchangePolicy(await this.stores.getStore(uuidParam(storeId)), body, this.owner(principal), ctx);
    }
    async lowStock(principal, ctx, storeId, body) {
        await this.settings.setLowStockThreshold(await this.stores.getStore(uuidParam(storeId)), body.threshold, this.owner(principal), ctx);
    }
};
__decorate([
    Roles('merchant'),
    RateLimit({ name: 'store-create', limit: 10, windowSeconds: 3600 }),
    Post('stores'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(createStoreSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "create", null);
__decorate([
    Roles('merchant'),
    Get('stores/mine'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "mine", null);
__decorate([
    StorePermission('member'),
    Get('stores/:storeId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "get", null);
__decorate([
    StorePermission('settings'),
    Patch('stores/:storeId/profile'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(profileSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "profile", null);
__decorate([
    StorePermission('settings'),
    Get('stores/:storeId/onboarding'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "onboarding", null);
__decorate([
    StorePermission('settings'),
    Get('stores/:storeId/documents'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "documents", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Post('stores/:storeId/documents'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Body(new ZodPipe(attachDocumentSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "attach", null);
__decorate([
    StorePermission('settings'),
    HttpCode(200),
    Post('stores/:storeId/submit'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "submit", null);
__decorate([
    StorePermission('settings'),
    Get('stores/:storeId/settings'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "getSettings", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Put('stores/:storeId/hours'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(hoursSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "hours", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Put('stores/:storeId/holidays'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(holidaysSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "holidays", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Post('stores/:storeId/pause'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(pauseSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "pause", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Delete('stores/:storeId/pause'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "resume", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Put('stores/:storeId/delivery'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(deliverySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "delivery", null);
__decorate([
    StorePermission('settings'),
    HttpCode(200),
    RateLimit({ name: 'delivery-preview', limit: 60, windowSeconds: 600 }),
    Post('stores/:storeId/delivery/preview'),
    __param(0, Param('storeId')),
    __param(1, Body(new ZodPipe(previewSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "preview", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Put('stores/:storeId/pickup'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(pickupSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "pickup", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Put('stores/:storeId/exchange-policy'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(exchangePolicySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "exchange", null);
__decorate([
    StorePermission('settings'),
    HttpCode(204),
    Put('stores/:storeId/low-stock'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(lowStockSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoresController.prototype, "lowStock", null);
StoresController = __decorate([
    Controller('v1'),
    __param(3, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [StoresService,
        StoreSettingsService,
        MediaService, Object])
], StoresController);
export { StoresController };
let CepController = class CepController {
    geocoding;
    constructor(geocoding) {
        this.geocoding = geocoding;
    }
    /**
     * WB-051 C3: autocompleta rua/bairro/cidade e a coordenada do centro do CEP (nula sem `GEOCODER_URL`). Qualquer conta autenticada
     * (o app do cliente consulta por aqui em vez de falar direto com o ViaCEP, inventário de dados §3); com limite e cache por CEP.
     */
    async lookup(cep) {
        if (!/^\d{5}-?\d{3}$/.test(cep))
            throw errors.validation([{ field: 'cep', message: 'CEP inválido.' }]);
        const found = await this.geocoding.lookup(cep.replace('-', '')).catch(() => {
            throw errors.unprocessable('CEP_LOOKUP_UNAVAILABLE', 'Serviço de CEP indisponível', { detail: 'Preencha o endereço à mão.' });
        });
        if (!found)
            throw errors.notFound('CEP não encontrado.');
        return found;
    }
};
__decorate([
    RateLimit({ name: 'cep-lookup', limit: 60, windowSeconds: 600 }),
    Get(':cep'),
    __param(0, Param('cep')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CepController.prototype, "lookup", null);
CepController = __decorate([
    Controller('v1/cep'),
    __param(0, Inject(GEOCODING_PROVIDER)),
    __metadata("design:paramtypes", [Object])
], CepController);
export { CepController };
let StorePaymentController = class StorePaymentController {
    stores;
    accounts;
    constructor(stores, accounts) {
        this.stores = stores;
        this.accounts = accounts;
    }
    async view(storeId) {
        return this.accounts.view(uuidParam(storeId));
    }
    async connect(principal, storeId) {
        return this.accounts.startConnect(await this.stores.getStore(uuidParam(storeId)), principal);
    }
    async callback(principal, ctx, storeId, body) {
        return this.accounts.completeConnect(await this.stores.getStore(uuidParam(storeId)), principal, body, ctx);
    }
    async disconnect(principal, ctx, storeId) {
        await this.accounts.disconnect(await this.stores.getStore(uuidParam(storeId)), principal, ctx);
    }
};
__decorate([
    StorePermission('payment_account'),
    Get('payment-account'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StorePaymentController.prototype, "view", null);
__decorate([
    StorePermission('payment_account'),
    RequireReauth(),
    HttpCode(200),
    RateLimit({ name: 'payment-connect', limit: 20, windowSeconds: 3600 }),
    Post('payment-account/connect'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StorePaymentController.prototype, "connect", null);
__decorate([
    StorePermission('payment_account'),
    HttpCode(200),
    RateLimit({ name: 'payment-callback', limit: 20, windowSeconds: 3600 }),
    Post('payment-account/callback'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(connectCallbackSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StorePaymentController.prototype, "callback", null);
__decorate([
    StorePermission('payment_account'),
    RequireReauth(),
    HttpCode(204),
    Delete('payment-account'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], StorePaymentController.prototype, "disconnect", null);
StorePaymentController = __decorate([
    Controller('v1/stores/:storeId'),
    __metadata("design:paramtypes", [StoresService,
        PaymentAccountService])
], StorePaymentController);
export { StorePaymentController };
let StoreTeamController = class StoreTeamController {
    stores;
    team;
    constructor(stores, team) {
        this.stores = stores;
        this.team = team;
    }
    async members(storeId) {
        return this.team.list(uuidParam(storeId));
    }
    async invite(principal, storeId, body) {
        const invitation = await this.team.invite(await this.stores.getStore(uuidParam(storeId)), principal, body);
        return { invitationId: invitation.invitationId, expiresAt: invitation.expiresAt.toISOString() };
    }
    async revoke(principal, storeId, invitationId) {
        await this.team.revokeInvitation(await this.stores.getStore(uuidParam(storeId)), principal, uuidParam(invitationId));
    }
    async permissions(principal, storeId, userId, body) {
        await this.team.setPermissions(await this.stores.getStore(uuidParam(storeId)), principal, uuidParam(userId), body.permissions);
    }
    async remove(principal, storeId, userId) {
        await this.team.remove(await this.stores.getStore(uuidParam(storeId)), principal, uuidParam(userId));
    }
    async activity(storeId) {
        return { data: await this.team.activity(uuidParam(storeId)), nextCursor: null };
    }
    async accept(body, ctx) {
        return this.team.accept(body, ctx);
    }
};
__decorate([
    StorePermission('team'),
    Get('stores/:storeId/members'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StoreTeamController.prototype, "members", null);
__decorate([
    StorePermission('team'),
    RequireReauth(),
    RateLimit({ name: 'staff-invite', limit: 30, windowSeconds: 3600 }),
    Post('stores/:storeId/members/invitations'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Body(new ZodPipe(inviteStaffSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoreTeamController.prototype, "invite", null);
__decorate([
    StorePermission('team'),
    RequireReauth(),
    HttpCode(204),
    Delete('stores/:storeId/members/invitations/:invitationId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('invitationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StoreTeamController.prototype, "revoke", null);
__decorate([
    StorePermission('team'),
    RequireReauth(),
    HttpCode(204),
    Patch('stores/:storeId/members/:userId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('userId')),
    __param(3, Body(new ZodPipe(memberPermissionsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreTeamController.prototype, "permissions", null);
__decorate([
    StorePermission('team'),
    RequireReauth(),
    HttpCode(204),
    Delete('stores/:storeId/members/:userId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StoreTeamController.prototype, "remove", null);
__decorate([
    StorePermission('team'),
    Get('stores/:storeId/activity'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StoreTeamController.prototype, "activity", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'staff-invite-accept', limit: 20, windowSeconds: 900 }),
    Post('auth/store-invitations/accept'),
    __param(0, Body(new ZodPipe(acceptStaffSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StoreTeamController.prototype, "accept", null);
StoreTeamController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [StoresService,
        TeamService])
], StoreTeamController);
export { StoreTeamController };
//# sourceMappingURL=stores.controllers.js.map