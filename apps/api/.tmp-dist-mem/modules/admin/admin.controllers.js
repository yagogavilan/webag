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
import { csvCell as sharedCsvCell } from '../../platform/http/csv.js';
import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, Public } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuditService } from './audit.service.js';
import { CATEGORY_ICONS } from './categories.icons.js';
import { CategoriesService } from './categories.service.js';
import { LEGAL_DOCUMENT_TYPES } from './db/schema.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { LegalService } from './legal.service.js';
import { ParametersService } from './parameters.service.js';
import { RegionsService } from './regions.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
const legalType = (value) => {
    if (!LEGAL_DOCUMENT_TYPES.includes(value))
        throw errors.notFound('Tipo de documento desconhecido.');
    return value;
};
const iso = (date) => date.toISOString();
// --------------------------------------------------------------------- schemas
const name = z.string().trim().min(2).max(80);
const citySchema = z.strictObject({ name, state: z.string().trim().length(2).default('SP'), active: z.boolean().default(false) });
const cityPatchSchema = z.strictObject({ name: name.optional(), active: z.boolean().optional() });
const hoodSchema = z.strictObject({ name, active: z.boolean().default(true) });
const categoryName = z.string().trim().min(2).max(30);
const categorySchema = z.strictObject({
    name: categoryName,
    icon: z.string().max(40),
    parentId: z.uuid().nullable().default(null),
    position: z.number().int().min(0).max(10_000).default(0),
    active: z.boolean().default(true),
});
const categoryPatchSchema = z.strictObject({
    name: categoryName.optional(),
    icon: z.string().max(40).optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    active: z.boolean().optional(),
});
const reorderSchema = z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) });
const reasonSchema = z.string().trim().min(5, 'Informe o motivo (mínimo 5 caracteres).').max(300);
/** RN-02: versão que o painel viu (`updatedAt` do parâmetro; `null` = nunca editado). Divergiu: 409 PARAMETER_CONFLICT. */
const expectedUpdatedAt = z.iso.datetime().nullable().optional();
const parameterUpdateSchema = z.strictObject({ value: z.union([z.number(), z.string().max(40)]), reason: reasonSchema, expectedUpdatedAt });
const parameterResetSchema = z.strictObject({ reason: reasonSchema, expectedUpdatedAt });
const flagSchema = z.strictObject({ enabled: z.boolean(), reason: reasonSchema.optional() });
const legalSchema = z.strictObject({
    title: z.string().trim().min(3).max(120),
    content: z.string().trim().min(20, 'O texto não pode ficar vazio.').max(200_000),
    effectiveAt: z.iso.datetime({ message: 'Informe a data de vigência.' }),
    relevantChange: z.boolean().default(false),
    changeSummary: z.string().trim().min(5).max(500).optional(),
});
const auditQuerySchema = z.strictObject({
    actorId: z.uuid().optional(),
    action: z.string().max(80).optional(),
    targetType: z.string().max(40).optional(),
    targetId: z.string().max(80).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    cursor: z.string().max(200).optional(),
    limit: z.string().max(4).optional(),
});
const auditExportQuerySchema = auditQuerySchema.omit({ cursor: true, limit: true });
// ------------------------------------------------------------------ regiões
let RegionsController = class RegionsController {
    regions;
    constructor(regions) {
        this.regions = regions;
    }
    /** Público: o app escolhe cidade/bairro sem login (brief §3.1). */
    async publicList() {
        return { data: await this.regions.listPublic(), nextCursor: null };
    }
    async list() {
        return { data: await this.regions.listCities(false), nextCursor: null };
    }
    create(body, ctx) {
        return this.regions.invalidating(() => this.regions.createCity(body, ctx));
    }
    update(cityId, body, ctx) {
        return this.regions.invalidating(() => this.regions.updateCity(id(cityId), body, ctx));
    }
    createNeighborhood(cityId, body, ctx) {
        return this.regions.invalidating(() => this.regions.createNeighborhood(id(cityId), body, ctx));
    }
    updateNeighborhood(neighborhoodId, body, ctx) {
        return this.regions.invalidating(() => this.regions.updateNeighborhood(id(neighborhoodId), body, ctx));
    }
};
__decorate([
    Public(),
    Get('regions'),
    Header('Cache-Control', 'public, max-age=60'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RegionsController.prototype, "publicList", null);
__decorate([
    AdminOnly('regions:read'),
    Get('admin/regions/cities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RegionsController.prototype, "list", null);
__decorate([
    AdminOnly('regions:write'),
    Post('admin/regions/cities'),
    __param(0, Body(new ZodPipe(citySchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RegionsController.prototype, "create", null);
__decorate([
    AdminOnly('regions:write'),
    Patch('admin/regions/cities/:cityId'),
    __param(0, Param('cityId')),
    __param(1, Body(new ZodPipe(cityPatchSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], RegionsController.prototype, "update", null);
__decorate([
    AdminOnly('regions:write'),
    Post('admin/regions/cities/:cityId/neighborhoods'),
    __param(0, Param('cityId')),
    __param(1, Body(new ZodPipe(hoodSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], RegionsController.prototype, "createNeighborhood", null);
__decorate([
    AdminOnly('regions:write'),
    Patch('admin/regions/neighborhoods/:neighborhoodId'),
    __param(0, Param('neighborhoodId')),
    __param(1, Body(new ZodPipe(cityPatchSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], RegionsController.prototype, "updateNeighborhood", null);
RegionsController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [RegionsService])
], RegionsController);
export { RegionsController };
// -------------------------------------------------------------- categorias
let CategoriesController = class CategoriesController {
    categories;
    constructor(categories) {
        this.categories = categories;
    }
    async publicTree() {
        return { data: await this.categories.tree(true), nextCursor: null };
    }
    async tree() {
        return { data: await this.categories.tree(false), icons: CATEGORY_ICONS, nextCursor: null };
    }
    create(body, ctx) {
        return this.categories.create(body, ctx);
    }
    async reorder(body, ctx) {
        await this.categories.reorder(body.ids, ctx);
    }
    update(categoryId, body, ctx) {
        return this.categories.update(id(categoryId), body, ctx);
    }
    async remove(categoryId, ctx) {
        await this.categories.remove(id(categoryId), ctx);
    }
};
__decorate([
    Public(),
    Get('categories'),
    Header('Cache-Control', 'public, max-age=60'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "publicTree", null);
__decorate([
    AdminOnly('categories:read'),
    Get('admin/categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "tree", null);
__decorate([
    AdminOnly('categories:write'),
    Post('admin/categories'),
    __param(0, Body(new ZodPipe(categorySchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "create", null);
__decorate([
    AdminOnly('categories:write'),
    HttpCode(204),
    Put('admin/categories/order'),
    __param(0, Body(new ZodPipe(reorderSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "reorder", null);
__decorate([
    AdminOnly('categories:write'),
    Patch('admin/categories/:categoryId'),
    __param(0, Param('categoryId')),
    __param(1, Body(new ZodPipe(categoryPatchSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "update", null);
__decorate([
    AdminOnly('categories:write'),
    HttpCode(204),
    Delete('admin/categories/:categoryId'),
    __param(0, Param('categoryId')),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "remove", null);
CategoriesController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [CategoriesService])
], CategoriesController);
export { CategoriesController };
// ---------------------------------------------------- parâmetros e feature flags
let ConfigController = class ConfigController {
    parameters;
    flags;
    constructor(parameters, flags) {
        this.parameters = parameters;
        this.flags = flags;
    }
    async listParameters() {
        return { data: await this.parameters.list(), nextCursor: null };
    }
    updateParameter(key, body, ctx) {
        return this.parameters.update(key, body.value, body.reason, ctx, body.expectedUpdatedAt);
    }
    resetParameter(key, body, ctx) {
        return this.parameters.reset(key, body.reason, ctx, body.expectedUpdatedAt);
    }
    /** Público: o app lê as flags e as guarda por até 60 s (WB-120 C4). */
    async publicFlags() {
        return { flags: await this.flags.publicMap() };
    }
    async listFlags() {
        return { data: await this.flags.list(), nextCursor: null };
    }
    setFlag(key, body, ctx) {
        return this.flags.set(key, body.enabled, ctx, body.reason);
    }
};
__decorate([
    AdminOnly('parameters:read'),
    Get('admin/parameters'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "listParameters", null);
__decorate([
    AdminOnly('parameters:write'),
    Put('admin/parameters/:key'),
    __param(0, Param('key')),
    __param(1, Body(new ZodPipe(parameterUpdateSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "updateParameter", null);
__decorate([
    AdminOnly('parameters:write'),
    Post('admin/parameters/:key/reset'),
    HttpCode(200),
    __param(0, Param('key')),
    __param(1, Body(new ZodPipe(parameterResetSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "resetParameter", null);
__decorate([
    Public(),
    Get('config/flags'),
    Header('Cache-Control', 'public, max-age=60'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "publicFlags", null);
__decorate([
    AdminOnly('flags:read'),
    Get('admin/feature-flags'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "listFlags", null);
__decorate([
    AdminOnly('flags:write'),
    Put('admin/feature-flags/:key'),
    __param(0, Param('key')),
    __param(1, Body(new ZodPipe(flagSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "setFlag", null);
ConfigController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [ParametersService,
        FeatureFlagsService])
], ConfigController);
export { ConfigController };
// ---------------------------------------------------------- termos e auditoria
let LegalController = class LegalController {
    legal;
    audit;
    constructor(legal, audit) {
        this.legal = legal;
        this.audit = audit;
    }
    /** Público: páginas /termos e /privacidade e o app mostram a versão vigente (WB-117 C3). */
    async current(type) {
        const doc = await this.legal.current(legalType(type));
        if (!doc)
            throw errors.notFound('Documento ainda não publicado.');
        return this.present(doc);
    }
    async versions(type) {
        const docs = await this.legal.versions(legalType(type));
        const extra = await this.legal.annotate(docs);
        return { data: docs.map((doc) => this.present(doc, extra.get(doc.id))), nextCursor: null };
    }
    async publish(type, body, ctx) {
        const doc = await this.legal.publish({ type: legalType(type), ...body, effectiveAt: new Date(body.effectiveAt) }, ctx);
        const extra = await this.legal.annotate([doc]);
        return this.present(doc, extra.get(doc.id));
    }
    /** Super admin vê tudo; os demais perfis só as PRÓPRIAS ações (WB-123): o filtro de ator é forçado no servidor. */
    async auditLog(principal, query) {
        const page = await this.audit.search(this.auditFilters(principal, query));
        return {
            data: page.data.map((row) => ({ ...row, at: iso(row.at) })),
            nextCursor: page.nextCursor,
        };
    }
    /** CSV com os mesmos filtros (até 5.000 linhas mais recentes). A própria exportação entra na auditoria. */
    async exportAudit(principal, query, ctx, res) {
        const filters = this.auditFilters(principal, query);
        const { rows, truncated } = await this.audit.export(filters);
        await this.audit.recordStandalone(ctx, { action: 'audit.export', targetType: 'audit_log', after: { rows: rows.length, truncated, filters: { ...query } } });
        res.setHeader('Content-Disposition', `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`);
        if (truncated)
            res.setHeader('X-Export-Truncated', 'true');
        return auditCsv(rows);
    }
    auditFilters(principal, query) {
        return {
            ...query,
            actorId: principal.adminProfile === 'super_admin' ? query.actorId : principal.userId,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
        };
    }
    present(doc, extra) {
        return {
            id: doc.id,
            type: doc.type,
            version: doc.version,
            title: doc.title,
            content: doc.content,
            effectiveAt: iso(doc.effectiveAt),
            relevantChange: doc.relevantChange,
            changeSummary: doc.changeSummary,
            publishedByName: extra?.publishedByName ?? null,
            acceptances: extra?.acceptances ?? null,
            createdAt: iso(doc.createdAt),
        };
    }
};
__decorate([
    Public(),
    RateLimit({ name: 'legal-public', limit: 120, windowSeconds: 60 }),
    Get('legal/:type'),
    Header('Cache-Control', 'public, max-age=60'),
    __param(0, Param('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LegalController.prototype, "current", null);
__decorate([
    AdminOnly('legal:read'),
    Get('admin/legal/:type'),
    __param(0, Param('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LegalController.prototype, "versions", null);
__decorate([
    AdminOnly('legal:write'),
    Post('admin/legal/:type'),
    __param(0, Param('type')),
    __param(1, Body(new ZodPipe(legalSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], LegalController.prototype, "publish", null);
__decorate([
    AdminOnly('audit:own'),
    Get('admin/audit-log'),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(auditQuerySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], LegalController.prototype, "auditLog", null);
__decorate([
    AdminOnly('audit:own'),
    RateLimit({ name: 'audit-export', limit: 10, windowSeconds: 60 }),
    Get('admin/audit-log/export'),
    Header('Content-Type', 'text/csv; charset=utf-8'),
    Header('Cache-Control', 'no-store'),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(auditExportQuerySchema))),
    __param(2, Ctx()),
    __param(3, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], LegalController.prototype, "exportAudit", null);
LegalController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [LegalService,
        AuditService])
], LegalController);
export { LegalController };
const CSV_COLUMNS = ['id', 'at', 'actorName', 'actorId', 'actorRole', 'action', 'targetType', 'targetId', 'reason', 'ip', 'device', 'requestId', 'before', 'after'];
const csvCell = (value) => sharedCsvCell(value, ',');
function auditCsv(rows) {
    const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
    return `\uFEFF${[CSV_COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}
//# sourceMappingURL=admin.controllers.js.map