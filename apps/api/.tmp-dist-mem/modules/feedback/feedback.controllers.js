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
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, Public, StorePermission } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { ContentReportsService, REMOVAL_REASONS } from './content-reports.service.js';
import { HELP_AUDIENCES, REPORT_REASONS, REPORT_TARGETS } from './db/schema.js';
import { HelpService } from './help.service.js';
import { StoreReviewsService } from './store-reviews.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
// ------------------------------------------------------------------- ajuda
const audienceQuery = z.strictObject({ audience: z.enum(HELP_AUDIENCES).default('customer') });
const faqCreate = z.strictObject({ audience: z.enum(HELP_AUDIENCES), group: z.string().min(2).max(20), question: z.string().trim().min(3).max(100), answer: z.string().trim().min(3).max(600), published: z.boolean().optional() });
const faqPatch = z.strictObject({ group: z.string().min(2).max(20).optional(), question: z.string().trim().min(3).max(100).optional(), answer: z.string().trim().min(3).max(600).optional(), published: z.boolean().optional() });
const faqReorder = z.strictObject({ audience: z.enum(HELP_AUDIENCES), group: z.string().min(2).max(20), ids: z.array(z.uuid()).min(1).max(100) });
const faqList = z.strictObject({ audience: z.enum(HELP_AUDIENCES).optional() });
const phone = z.string().trim().transform((v) => v.replace(/\D/g, '')).pipe(z.string().regex(/^\d{10,13}$/, 'Confira o WhatsApp com DDD.'));
const contactsSchema = z.strictObject({
    supportWhatsapp: phone.nullable().optional(),
    supportEmail: z.string().trim().toLowerCase().max(120).pipe(z.email({ message: 'Confira o e-mail.' })).nullable().optional(),
    supportHours: z.string().trim().max(60).nullable().optional(),
    privacyOfficerName: z.string().trim().max(80).nullable().optional(),
    privacyOfficerEmail: z.string().trim().toLowerCase().max(120).pipe(z.email({ message: 'Confira o e-mail.' })).nullable().optional(),
});
/** WB-034 / WB-227 C4: ajuda pública (visitante, cliente e lojista), perguntas publicadas e contatos da configuração. */
let HelpController = class HelpController {
    help;
    constructor(help) {
        this.help = help;
    }
    get(query) {
        return this.help.publicHelp(query.audience);
    }
};
__decorate([
    Public(),
    Get(),
    RateLimit({ name: 'help-public', limit: 120, windowSeconds: 60 }),
    __param(0, Query(new ZodPipe(audienceQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "get", null);
HelpController = __decorate([
    Controller('v1/help'),
    __metadata("design:paramtypes", [HelpService])
], HelpController);
export { HelpController };
/** AJ3: conteúdo da ajuda (perguntas e contatos). Operação e super admin editam; financeiro e suporte leem. */
let AdminHelpController = class AdminHelpController {
    help;
    constructor(help) {
        this.help = help;
    }
    list(query) {
        return this.help.listFaqs(query.audience);
    }
    create(ctx, body) {
        return this.help.createFaq(ctx, body);
    }
    reorder(ctx, body) {
        return this.help.reorder(ctx, body);
    }
    update(ctx, id, body) {
        return this.help.updateFaq(ctx, idParam(id), body);
    }
    async remove(ctx, id) {
        await this.help.deleteFaq(ctx, idParam(id));
    }
    contacts() {
        return this.help.contacts();
    }
    putContacts(ctx, body) {
        return this.help.putContacts(ctx, body);
    }
};
__decorate([
    AdminOnly('help:read'),
    Get('faqs'),
    __param(0, Query(new ZodPipe(faqList))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminHelpController.prototype, "list", null);
__decorate([
    AdminOnly('help:write'),
    Post('faqs'),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(faqCreate))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminHelpController.prototype, "create", null);
__decorate([
    AdminOnly('help:write'),
    Post('faqs/reorder'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(faqReorder))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminHelpController.prototype, "reorder", null);
__decorate([
    AdminOnly('help:write'),
    Patch('faqs/:id'),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(faqPatch))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminHelpController.prototype, "update", null);
__decorate([
    AdminOnly('help:write'),
    Delete('faqs/:id'),
    HttpCode(204),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminHelpController.prototype, "remove", null);
__decorate([
    AdminOnly('help:read'),
    Get('contacts'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminHelpController.prototype, "contacts", null);
__decorate([
    AdminOnly('help:write'),
    Put('contacts'),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(contactsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminHelpController.prototype, "putContacts", null);
AdminHelpController = __decorate([
    Controller('v1/admin/help'),
    __metadata("design:paramtypes", [HelpService])
], AdminHelpController);
export { AdminHelpController };
// ---------------------------------------------------------------- denúncias
const reportSchema = z.strictObject({ targetType: z.enum(REPORT_TARGETS), targetId: z.uuid(), reason: z.enum(REPORT_REASONS), text: z.string().trim().max(200).optional() });
const queueQuery = z.strictObject({ targetType: z.enum(REPORT_TARGETS), status: z.enum(['open', 'handled']).optional(), cursor: z.string().max(300).optional(), limit: z.string().max(4).optional() });
const keepSchema = z.strictObject({ note: z.string().trim().min(3).max(200).optional() });
const removeSchema = z.strictObject({ reasonCode: z.enum(REMOVAL_REASONS), note: z.string().trim().max(150).optional() });
const targetParam = (type) => {
    if (!REPORT_TARGETS.includes(type))
        throw errors.notFound();
    return type;
};
/** DN1: denunciar avaliação, produto ou loja (exigência das lojas de apps). */
let ContentReportsController = class ContentReportsController {
    reports;
    constructor(reports) {
        this.reports = reports;
    }
    /** Sempre `202 { received: true }`, também na repetição e na denúncia da própria avaliação (não revela o que já existia). */
    submit(principal, body) {
        return this.reports.submit(principal.userId, body);
    }
    mine(principal) {
        return this.reports.mine(principal.userId);
    }
};
__decorate([
    Post('reports'),
    HttpCode(202),
    RateLimit({ name: 'content-report', limit: 20, windowSeconds: 3600 }),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(reportSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ContentReportsController.prototype, "submit", null);
__decorate([
    Get('me/reports'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ContentReportsController.prototype, "mine", null);
ContentReportsController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [ContentReportsService])
], ContentReportsController);
export { ContentReportsController };
/** DN2: moderação de denúncias (operação e super admin). */
let AdminContentReportsController = class AdminContentReportsController {
    reports;
    constructor(reports) {
        this.reports = reports;
    }
    queue(query) {
        return this.reports.queue(query);
    }
    detail(type, id) {
        return this.reports.detail(targetParam(type), idParam(id));
    }
    keep(ctx, type, id, body) {
        return this.reports.keep(ctx, targetParam(type), idParam(id), body.note);
    }
    /** Só avaliação: ofensa, dado pessoal, ilegal ou spam. Não existe o motivo "avaliação negativa" (RN-12). */
    remove(ctx, id, body) {
        return this.reports.removeReview(ctx, idParam(id), body.reasonCode, body.note);
    }
    forward(ctx, type, id) {
        const target = targetParam(type);
        if (target === 'review')
            throw errors.validation([{ field: 'targetType', message: 'Avaliação se mantém ou se remove; só produto e loja são encaminhados.' }]);
        return this.reports.forward(ctx, target, idParam(id));
    }
};
__decorate([
    AdminOnly('moderation:read'),
    Get(),
    __param(0, Query(new ZodPipe(queueQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminContentReportsController.prototype, "queue", null);
__decorate([
    AdminOnly('moderation:read'),
    Get(':targetType/:targetId'),
    __param(0, Param('targetType')),
    __param(1, Param('targetId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminContentReportsController.prototype, "detail", null);
__decorate([
    AdminOnly('moderation:write'),
    Post(':targetType/:targetId/keep'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Param('targetType')),
    __param(2, Param('targetId')),
    __param(3, Body(new ZodPipe(keepSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], AdminContentReportsController.prototype, "keep", null);
__decorate([
    AdminOnly('moderation:write'),
    Post('review/:targetId/remove'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Param('targetId')),
    __param(2, Body(new ZodPipe(removeSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminContentReportsController.prototype, "remove", null);
__decorate([
    AdminOnly('moderation:write'),
    Post(':targetType/:targetId/forward'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Param('targetType')),
    __param(2, Param('targetId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], AdminContentReportsController.prototype, "forward", null);
AdminContentReportsController = __decorate([
    Controller('v1/admin/content-reports'),
    __metadata("design:paramtypes", [ContentReportsService])
], AdminContentReportsController);
export { AdminContentReportsController };
// -------------------------------------------------- avaliações no painel da loja
const reviewsQuery = z.strictObject({ replied: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), rating: z.coerce.number().int().min(1).max(5).optional(), cursor: z.string().max(300).optional(), limit: z.string().max(4).optional() });
const replySchema = z.strictObject({ text: z.string().trim().min(1).max(500) });
/** Avaliações da loja e resposta pública do lojista (permissão `reviews`; funcionário sem ela: 403, outra loja: 404). */
let StoreReviewsController = class StoreReviewsController {
    reviews;
    constructor(reviews) {
        this.reviews = reviews;
    }
    list(storeId, query) {
        return this.reviews.list(idParam(storeId), query);
    }
    reply(principal, storeId, reviewId, body) {
        return this.reviews.reply(idParam(storeId), idParam(reviewId), principal.userId, body.text);
    }
    async removeReply(principal, storeId, reviewId) {
        await this.reviews.removeReply(idParam(storeId), idParam(reviewId), principal.userId);
    }
};
__decorate([
    StorePermission('reviews'),
    Get(),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(reviewsQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], StoreReviewsController.prototype, "list", null);
__decorate([
    StorePermission('reviews'),
    Put(':reviewId/reply'),
    RateLimit({ name: 'review-reply', limit: 60, windowSeconds: 3600 }),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('reviewId')),
    __param(3, Body(new ZodPipe(replySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], StoreReviewsController.prototype, "reply", null);
__decorate([
    StorePermission('reviews'),
    Delete(':reviewId/reply'),
    HttpCode(204),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('reviewId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StoreReviewsController.prototype, "removeReply", null);
StoreReviewsController = __decorate([
    Controller('v1/stores/:storeId/reviews'),
    __metadata("design:paramtypes", [StoreReviewsService])
], StoreReviewsController);
export { StoreReviewsController };
//# sourceMappingURL=feedback.controllers.js.map