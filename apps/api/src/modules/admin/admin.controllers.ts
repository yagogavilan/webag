import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, Public, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuditService, type AuditRow } from './audit.service.js';
import { CATEGORY_ICONS } from './categories.icons.js';
import { CategoriesService } from './categories.service.js';
import { LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from './db/schema.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { LegalService } from './legal.service.js';
import { ParametersService } from './parameters.service.js';
import { RegionsService } from './regions.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};
const legalType = (value: string): LegalDocumentType => {
  if (!(LEGAL_DOCUMENT_TYPES as readonly string[]).includes(value)) throw errors.notFound('Tipo de documento desconhecido.');
  return value as LegalDocumentType;
};
const iso = (date: Date): string => date.toISOString();

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
@Controller('v1')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  /** Público: o app escolhe cidade/bairro sem login (brief §3.1). */
  @Public()
  @Get('regions')
  @Header('Cache-Control', 'public, max-age=60')
  async publicList() {
    const cities = await this.regions.listCities(true);
    return { data: cities.map((c) => ({ id: c.id, name: c.name, state: c.state, slug: c.slug, neighborhoods: c.neighborhoods.map((n) => ({ id: n.id, name: n.name })) })), nextCursor: null };
  }

  @AdminOnly('regions:read')
  @Get('admin/regions/cities')
  async list() {
    return { data: await this.regions.listCities(false), nextCursor: null };
  }

  @AdminOnly('regions:write')
  @Post('admin/regions/cities')
  create(@Body(new ZodPipe(citySchema)) body: z.infer<typeof citySchema>, @Ctx() ctx: RequestContext) {
    return this.regions.createCity(body, ctx);
  }

  @AdminOnly('regions:write')
  @Patch('admin/regions/cities/:cityId')
  update(@Param('cityId') cityId: string, @Body(new ZodPipe(cityPatchSchema)) body: z.infer<typeof cityPatchSchema>, @Ctx() ctx: RequestContext) {
    return this.regions.updateCity(id(cityId), body, ctx);
  }

  @AdminOnly('regions:write')
  @Post('admin/regions/cities/:cityId/neighborhoods')
  createNeighborhood(@Param('cityId') cityId: string, @Body(new ZodPipe(hoodSchema)) body: z.infer<typeof hoodSchema>, @Ctx() ctx: RequestContext) {
    return this.regions.createNeighborhood(id(cityId), body, ctx);
  }

  @AdminOnly('regions:write')
  @Patch('admin/regions/neighborhoods/:neighborhoodId')
  updateNeighborhood(
    @Param('neighborhoodId') neighborhoodId: string,
    @Body(new ZodPipe(cityPatchSchema)) body: z.infer<typeof cityPatchSchema>,
    @Ctx() ctx: RequestContext,
  ) {
    return this.regions.updateNeighborhood(id(neighborhoodId), body, ctx);
  }
}

// -------------------------------------------------------------- categorias
@Controller('v1')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get('categories')
  @Header('Cache-Control', 'public, max-age=60')
  async publicTree() {
    return { data: await this.categories.tree(true), nextCursor: null };
  }

  @AdminOnly('categories:read')
  @Get('admin/categories')
  async tree() {
    return { data: await this.categories.tree(false), icons: CATEGORY_ICONS, nextCursor: null };
  }

  @AdminOnly('categories:write')
  @Post('admin/categories')
  create(@Body(new ZodPipe(categorySchema)) body: z.infer<typeof categorySchema>, @Ctx() ctx: RequestContext) {
    return this.categories.create(body, ctx);
  }

  @AdminOnly('categories:write')
  @HttpCode(204)
  @Put('admin/categories/order')
  async reorder(@Body(new ZodPipe(reorderSchema)) body: z.infer<typeof reorderSchema>, @Ctx() ctx: RequestContext): Promise<void> {
    await this.categories.reorder(body.ids, ctx);
  }

  @AdminOnly('categories:write')
  @Patch('admin/categories/:categoryId')
  update(@Param('categoryId') categoryId: string, @Body(new ZodPipe(categoryPatchSchema)) body: z.infer<typeof categoryPatchSchema>, @Ctx() ctx: RequestContext) {
    return this.categories.update(id(categoryId), body, ctx);
  }

  @AdminOnly('categories:write')
  @HttpCode(204)
  @Delete('admin/categories/:categoryId')
  async remove(@Param('categoryId') categoryId: string, @Ctx() ctx: RequestContext): Promise<void> {
    await this.categories.remove(id(categoryId), ctx);
  }
}

// ---------------------------------------------------- parâmetros e feature flags
@Controller('v1')
export class ConfigController {
  constructor(
    private readonly parameters: ParametersService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @AdminOnly('parameters:read')
  @Get('admin/parameters')
  async listParameters() {
    return { data: await this.parameters.list(), nextCursor: null };
  }

  @AdminOnly('parameters:write')
  @Put('admin/parameters/:key')
  updateParameter(@Param('key') key: string, @Body(new ZodPipe(parameterUpdateSchema)) body: z.infer<typeof parameterUpdateSchema>, @Ctx() ctx: RequestContext) {
    return this.parameters.update(key, body.value, body.reason, ctx, body.expectedUpdatedAt);
  }

  @AdminOnly('parameters:write')
  @Post('admin/parameters/:key/reset')
  @HttpCode(200)
  resetParameter(@Param('key') key: string, @Body(new ZodPipe(parameterResetSchema)) body: z.infer<typeof parameterResetSchema>, @Ctx() ctx: RequestContext) {
    return this.parameters.reset(key, body.reason, ctx, body.expectedUpdatedAt);
  }

  /** Público: o app lê as flags e as guarda por até 60 s (WB-120 C4). */
  @Public()
  @Get('config/flags')
  @Header('Cache-Control', 'public, max-age=60')
  async publicFlags() {
    return { flags: await this.flags.publicMap() };
  }

  @AdminOnly('flags:read')
  @Get('admin/feature-flags')
  async listFlags() {
    return { data: await this.flags.list(), nextCursor: null };
  }

  @AdminOnly('flags:write')
  @Put('admin/feature-flags/:key')
  setFlag(@Param('key') key: string, @Body(new ZodPipe(flagSchema)) body: z.infer<typeof flagSchema>, @Ctx() ctx: RequestContext) {
    return this.flags.set(key, body.enabled, ctx, body.reason);
  }
}

// ---------------------------------------------------------- termos e auditoria
@Controller('v1')
export class LegalController {
  constructor(
    private readonly legal: LegalService,
    private readonly audit: AuditService,
  ) {}

  /** Público: páginas /termos e /privacidade e o app mostram a versão vigente (WB-117 C3). */
  @Public()
  @RateLimit({ name: 'legal-public', limit: 120, windowSeconds: 60 })
  @Get('legal/:type')
  @Header('Cache-Control', 'public, max-age=60')
  async current(@Param('type') type: string) {
    const doc = await this.legal.current(legalType(type));
    if (!doc) throw errors.notFound('Documento ainda não publicado.');
    return this.present(doc);
  }

  @AdminOnly('legal:read')
  @Get('admin/legal/:type')
  async versions(@Param('type') type: string) {
    const docs = await this.legal.versions(legalType(type));
    const extra = await this.legal.annotate(docs);
    return { data: docs.map((doc) => this.present(doc, extra.get(doc.id))), nextCursor: null };
  }

  @AdminOnly('legal:write')
  @Post('admin/legal/:type')
  async publish(@Param('type') type: string, @Body(new ZodPipe(legalSchema)) body: z.infer<typeof legalSchema>, @Ctx() ctx: RequestContext) {
    const doc = await this.legal.publish({ type: legalType(type), ...body, effectiveAt: new Date(body.effectiveAt) }, ctx);
    const extra = await this.legal.annotate([doc]);
    return this.present(doc, extra.get(doc.id));
  }

  /** Super admin vê tudo; os demais perfis só as PRÓPRIAS ações (WB-123): o filtro de ator é forçado no servidor. */
  @AdminOnly('audit:own')
  @Get('admin/audit-log')
  async auditLog(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>) {
    const page = await this.audit.search(this.auditFilters(principal, query));
    return {
      data: page.data.map((row) => ({ ...row, at: iso(row.at) })),
      nextCursor: page.nextCursor,
    };
  }

  /** CSV com os mesmos filtros (até 5.000 linhas mais recentes). A própria exportação entra na auditoria. */
  @AdminOnly('audit:own')
  @RateLimit({ name: 'audit-export', limit: 10, windowSeconds: 60 })
  @Get('admin/audit-log/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async exportAudit(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodPipe(auditExportQuerySchema)) query: z.infer<typeof auditExportQuerySchema>,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const filters = this.auditFilters(principal, query);
    const { rows, truncated } = await this.audit.export(filters);
    await this.audit.recordStandalone(ctx, { action: 'audit.export', targetType: 'audit_log', after: { rows: rows.length, truncated, filters: { ...query } } });
    res.setHeader('Content-Disposition', `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`);
    if (truncated) res.setHeader('X-Export-Truncated', 'true');
    return auditCsv(rows);
  }

  private auditFilters(principal: Principal, query: z.infer<typeof auditQuerySchema>) {
    return {
      ...query,
      actorId: principal.adminProfile === 'super_admin' ? query.actorId : principal.userId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
  }

  private present(doc: Awaited<ReturnType<LegalService['byId']>>, extra?: { publishedByName: string | null; acceptances: number }) {
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
}

const CSV_COLUMNS = ['id', 'at', 'actorName', 'actorId', 'actorRole', 'action', 'targetType', 'targetId', 'reason', 'ip', 'device', 'requestId', 'before', 'after'] as const;

/** Escapa para CSV e neutraliza fórmulas de planilha (`=`, `+`, `-`, `@`) para o texto não executar no Excel. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function auditCsv(rows: AuditRow[]): string {
  const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
  return `\uFEFF${[CSV_COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}
