import { randomInt } from 'node:crypto';
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { DeliveryFeesService } from '../logistics/index.js';
import type { AdminProfile } from '../identity/db/schema.js';
import { IdempotencyService } from '../idempotency/index.js';
import { campaignStoreEnrollments, campaigns, couponFraudClaims, couponFraudSignals, couponIdentifierSightings, coupons, type Campaign } from './db/schema.js';
import { checkActivation, hasWebagCost, simulateBands, worstCaseWebag, type ActivationBlocker, type ActivationContext, type BandInput, type CampaignFacts } from './domain/activation.js';
import type { FundingSource } from './domain/composition.js';
import type { CampaignCreateInput, CampaignPatchInput } from './campaigns.schemas.js';

const SAFE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L (leitura em voz alta e na tela)
const DAY_MS = 86_400_000;
/** Lista de UUIDs para `in (...)` em SQL cru (o driver expande o array JS em parâmetros separados, não em `uuid[]`). */
const uuidList = (ids: string[]): SQL => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/** C-CUP-06: código privado = 10 caracteres aleatórios (~50 bits) de `crypto.randomInt`, alfabeto sem ambiguidade; o mínimo do banco é 8. */
export function generatePrivateCode(length = 10): string {
  return Array.from({ length }, () => SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)]!).join('');
}

const FUNDING_LABEL = (funding: FundingSource, storeSharePct: number): string => {
  switch (funding) {
    case 'webag': return 'Webag paga';
    case 'store': return 'Loja paga';
    case 'self_funded': return 'Autofinanciado';
    case 'split': return `Dividido: loja ${storeSharePct}% e Webag ${100 - storeSharePct}%`;
  }
};

const isUniqueViolation = (error: unknown, constraint?: string): boolean => {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = e?.code ?? e?.cause?.code;
  const name = e?.constraint ?? e?.cause?.constraint;
  return code === '23505' && (constraint === undefined || name === constraint);
};

/**
 * Campanhas e cupons por fonte de custo (WB-340, WB-342, WB-349; ADR-019). Regras de dinheiro DEC-088: nenhuma rotina majora preço, frete ou taxa; o orçamento da Webag é R$ 0 por padrão (F2).
 * Ativar, retomar e encerrar com custo da Webag exigem `coupons:activate` (guard) e reautenticação recente (aqui, pela fonte GRAVADA, nunca pelo corpo, Q8).
 * Campanha ativa é imutável; editar `scheduled` a devolve a `draft` (SEC-224); a varredura que liga `scheduled -> active` repete as conferências da ativação.
 */
@Injectable()
export class CampaignsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CampaignsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly flags: FeatureFlagsService,
    private readonly fees: DeliveryFeesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timer = setInterval(() => void this.sweep().catch((e: Error) => this.logger.error(e.message)), 60_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // =================================================================== apresentação

  private factsOf(c: Campaign): CampaignFacts {
    return { name: c.name, owner: c.owner, funding: c.fundingSource, storeSharePct: c.storeSharePct, kind: c.kind, value: c.value, percentCapCents: c.percentCapCents, minOrderCents: c.minOrderCents, startsAt: c.startsAt, endsAt: c.endsAt, budgetTotalCents: c.budgetTotalCents, budgetDailyCents: c.budgetDailyCents, maxUses: c.maxUses };
  }

  private async bands(): Promise<BandInput[]> {
    const table = await this.fees.resolve({ cityId: null, neighborhoodId: null });
    const tiers = table?.tiers ?? [];
    return [
      { id: 'pickup', label: 'Retirada', fromM: null, toM: null, pickup: true, deliveryFeeCents: 0, courierCostCents: 0 },
      ...tiers.map((t, i) => ({ id: `tier-${i + 1}`, label: i === 0 ? `Até ${t.toM / 1000} km` : `${tiers[i - 1]!.toM / 1000} a ${t.toM / 1000} km`, fromM: t.fromM, toM: t.toM, pickup: false, deliveryFeeCents: t.feeCents, courierCostCents: t.expectedCostCents })),
    ];
  }

  private async serviceFeeOf(): Promise<(subtotalCents: number) => number> {
    const type = String(await this.params.get('taxa_servico_tipo'));
    const value = await this.params.getNumber('taxa_servico_valor');
    return (subtotal) => (type === 'fixa' ? value : type === 'percentual' ? Math.floor((subtotal * value * 2 + 10_000) / 20_000) : 0);
  }

  /** O que as OUTRAS campanhas vivas ainda podem gastar (total menos gasto) mais o gasto confirmado no mês de São Paulo: o "comprometido" do orçamento mensal global. */
  async committedCents(excludeId: string | null, db: Db | Tx = this.db): Promise<{ committed: number; spentMonth: number }> {
    const live = await db.execute<{ committed: string }>(sql`
      select coalesce(sum(greatest(budget_total_cents - budget_spent_cents, 0)), 0)::text as committed from campaigns
       where state in ('scheduled', 'active', 'paused') and funding_source <> 'store' and budget_total_cents is not null
         ${excludeId ? sql`and id <> ${excludeId}::uuid` : sql``}`);
    const spent = await db.execute<{ spent: string }>(sql`
      select coalesce(sum(case kind when 'confirm' then amount_cents when 'refund' then -amount_cents else 0 end), 0)::text as spent from campaign_budget_entries
       where funder = 'webag' and month = date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date`);
    return { committed: Number(live.rows[0]?.committed ?? 0), spentMonth: Number(spent.rows[0]?.spent ?? 0) };
  }

  private async activationContext(excludeId: string | null, acceptedStores: number, db: Db | Tx = this.db): Promise<ActivationContext> {
    const { committed, spentMonth } = await this.committedCents(excludeId, db);
    return {
      freeShippingEnabled: await this.flags.isEnabled('campanha_frete_gratis'),
      storeShareEnabled: await this.flags.isEnabled('campanha_parte_da_loja'),
      monthlyBudgetCents: await this.params.getNumber('cupom_orcamento_mensal_webag_cents'),
      committedCents: committed + spentMonth,
      acceptedStores,
      autofinTetoPct: await this.params.getNumber('autofin_teto_pct'),
      minTotalCents: await this.params.getNumber('cupom_total_minimo_cents'),
      referenceCommissionPct: await this.params.getNumber('comissao_padrao_pct'),
      serviceFeeOf: await this.serviceFeeOf(),
      bands: await this.bands(),
    };
  }

  private async acceptedStores(campaignId: string, db: Db | Tx = this.db): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(campaignStoreEnrollments).where(and(eq(campaignStoreEnrollments.campaignId, campaignId), eq(campaignStoreEnrollments.state, 'accepted')));
    return row?.n ?? 0;
  }

  private async present(rows: Campaign[], viewer: AdminProfile | null) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const days = await this.db.execute<{ campaign_id: string; day: string; reserved: number; spent: number; today: string }>(sql`
      select campaign_id, day::text, reserved_cents as reserved, spent_cents as spent, (now() at time zone 'America/Sao_Paulo')::date::text as today
        from campaign_budget_days where campaign_id in (${uuidList(ids)}) and day = (now() at time zone 'America/Sao_Paulo')::date`);
    const dayOf = new Map(days.rows.map((d) => [d.campaign_id, d]));
    const [{ today }] = (await this.db.execute<{ today: string }>(sql`select (now() at time zone 'America/Sao_Paulo')::date::text as today`)).rows as [{ today: string }];
    const enrollmentRows = await this.db.select({ campaignId: campaignStoreEnrollments.campaignId, state: campaignStoreEnrollments.state, n: sql<number>`count(*)::int` }).from(campaignStoreEnrollments).where(inArray(campaignStoreEnrollments.campaignId, ids)).groupBy(campaignStoreEnrollments.campaignId, campaignStoreEnrollments.state);
    const codeRows = await this.db.select().from(coupons).where(inArray(coupons.campaignId, ids));
    const provisional = !(await this.flags.isEnabled('custo_motoboy_confirmado'));
    const ctx = await this.activationContext(null, 0);
    return Promise.all(
      rows.map(async (c) => {
        const day = dayOf.get(c.id);
        const total = c.budgetTotalCents;
        const counts = { invited: 0, accepted: 0, declined: 0, left: 0, expired: 0 };
        for (const e of enrollmentRows.filter((x) => x.campaignId === c.id)) counts[e.state === 'pending' ? 'invited' : e.state] = e.n;
        const verdict = checkActivation(this.factsOf(c), { ...ctx, acceptedStores: counts.accepted, committedCents: (await this.committedCents(c.id)).committed + (await this.committedCents(c.id)).spentMonth });
        const profileOk = viewer === 'super_admin' || viewer === 'finance';
        return {
          id: c.id, owner: c.owner, name: c.name, state: c.state, version: c.version, fundingSource: c.fundingSource, fundingLabel: FUNDING_LABEL(c.fundingSource, c.storeSharePct), storeSharePct: c.storeSharePct, endReason: c.endReason, pausedBy: c.pausedBy,
          startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null,
          budget: {
            totalCents: total, reservedCents: c.budgetReservedCents, spentCents: c.budgetSpentCents, remainingCents: total === null ? null : total - c.budgetReservedCents - c.budgetSpentCents,
            dailyCents: c.budgetDailyCents, dailyReservedCents: day?.reserved ?? 0, dailySpentCents: day?.spent ?? 0, dailyRemainingCents: c.budgetDailyCents === null ? null : c.budgetDailyCents - (day?.reserved ?? 0) - (day?.spent ?? 0),
            day: today, maxUses: c.maxUses, usesReserved: c.usesReserved, usesConfirmed: c.usesConfirmed,
          },
          enrollments: counts, updatedAt: c.updatedAt.toISOString(),
          kind: c.kind, value: c.value, percentCapCents: c.percentCapCents, minOrderCents: c.minOrderCents, audience: c.audience, reactivationDays: c.reactivationDays,
          target: { kind: c.targetKind, cityId: c.targetCityId, storeId: c.targetStoreId, categoryId: c.targetCategoryId },
          perCustomerLimit: c.perCustomerLimit,
          codes: codeRows.filter((k) => k.campaignId === c.id).map((k) => ({ code: k.code, visibility: k.visibility, active: k.active })),
          activation: { canActivate: profileOk && verdict.blockers.length === 0 && (!verdict.requiresSuperAdmin || viewer === 'super_admin'), requiresStepUp: verdict.requiresStepUp, requiresSuperAdmin: verdict.requiresSuperAdmin, maxCostCents: verdict.maxCostCents, blockers: verdict.blockers },
          courierCostProvisional: provisional, createdAt: c.createdAt.toISOString(), activatedAt: c.activatedAt?.toISOString() ?? null,
        };
      }),
    );
  }

  // =================================================================== leitura

  async list(viewer: AdminProfile | null, query: { state?: string | undefined; fundingSource?: string | undefined; owner?: string | undefined; cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const where: (SQL | undefined)[] = [];
    if (query.state) where.push(eq(campaigns.state, query.state as Campaign['state']));
    if (query.fundingSource) where.push(eq(campaigns.fundingSource, query.fundingSource as Campaign['fundingSource']));
    if (query.owner) where.push(eq(campaigns.owner, query.owner as Campaign['owner']));
    if (cursor) where.push(sql`(${campaigns.createdAt}, ${campaigns.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`);
    const rows = await this.db.select().from(campaigns).where(and(...where)).orderBy(desc(campaigns.createdAt), desc(campaigns.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { data: (await this.present(page, viewer)).map(summaryOf), nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  private async load(id: string, db: Db | Tx = this.db, lock = false): Promise<Campaign> {
    const query = db.select().from(campaigns).where(eq(campaigns.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw errors.notFound('Campanha não encontrada.');
    return row;
  }

  async get(viewer: AdminProfile | null, id: string) {
    const [view] = await this.present([await this.load(id)], viewer);
    return view!;
  }

  /** Orçamento mensal global (C10, C11): leitura; quem altera é o super admin pelas rotas de parâmetros. */
  async globalBudget() {
    const monthly = await this.params.getNumber('cupom_orcamento_mensal_webag_cents');
    const { committed, spentMonth } = await this.committedCents(null);
    const [{ month }] = (await this.db.execute<{ month: string }>(sql`select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date::text as month`)).rows as [{ month: string }];
    return {
      monthlyBudgetCents: monthly, committedCents: committed, spentMonthCents: spentMonth, remainingCents: monthly - committed - spentMonth, monthStart: month,
      autofinTetoPct: await this.params.getNumber('autofin_teto_pct'), webagFundingEnabled: monthly > 0, courierCostProvisional: !(await this.flags.isEnabled('custo_motoboy_confirmado')),
    };
  }

  // =================================================================== simulação

  async simulate(input: { fundingSource: FundingSource; storeSharePct?: number | undefined; kind: 'percent' | 'fixed' | 'free_shipping'; value?: number | undefined; percentCapCents?: number | null | undefined; minOrderCents?: number | undefined; budgetTotalCents?: number | null | undefined; budgetDailyCents?: number | null | undefined; maxUses?: number | null | undefined; referenceSubtotalCents?: number | undefined }) {
    this.validateRule({ funding: input.fundingSource, storeSharePct: input.storeSharePct, kind: input.kind, value: input.value ?? 0, percentCapCents: input.percentCapCents ?? null });
    const funding = input.fundingSource;
    const share = funding === 'store' ? 100 : funding === 'split' ? input.storeSharePct! : 0;
    const facts: CampaignFacts = { name: 'simulação', owner: 'webag', funding, storeSharePct: share, kind: input.kind, value: input.value ?? 0, percentCapCents: input.percentCapCents ?? null, minOrderCents: input.minOrderCents ?? 0, startsAt: null, endsAt: null, budgetTotalCents: input.budgetTotalCents ?? null, budgetDailyCents: input.budgetDailyCents ?? null, maxUses: input.maxUses ?? null };
    const ctx = await this.activationContext(null, 0);
    const sim = simulateBands(facts, ctx, input.referenceSubtotalCents);
    const verdict = checkActivation(facts, ctx);
    const worst = worstCaseWebag(facts, ctx.bands);
    const global = await this.globalBudget();
    const firstDiscount = sim.rows.find((r) => r.applicable && r.discountWebagCents > 0)?.discountWebagCents ?? null;
    return {
      referenceSubtotalCents: sim.referenceSubtotalCents,
      commissionPct: ctx.referenceCommissionPct,
      autofinTetoPct: ctx.autofinTetoPct,
      courierCostSource: ctx.bands.some((b) => b.courierCostCents > 0) && !global.courierCostProvisional ? 'delivery_fee_table' : 'provisional',
      provisional: global.courierCostProvisional,
      rows: sim.rows.map((r) => ({ band: { id: r.band.id, label: r.band.label, fromM: r.band.fromM, toM: r.band.toM, pickup: r.band.pickup }, deliveryFeeCents: r.band.deliveryFeeCents, courierCostCents: r.band.pickup ? 0 : r.band.courierCostCents, commissionCents: r.commissionCents, serviceFeeCents: r.serviceFeeCents, marginCents: r.marginCents, discountGrossCents: r.discountGrossCents, discountStoreCents: r.discountStoreCents, discountWebagCents: r.discountWebagCents, remainingCents: r.remainingCents, loss: r.remainingCents < 0, minOrderNeededCents: r.minOrderNeededCents, applicable: r.applicable })),
      worstCase: { discountWebagCents: worst.webagCents, band: worst.band ? { id: worst.band.id, label: worst.band.label, fromM: worst.band.fromM, toM: worst.band.toM, pickup: worst.band.pickup } : { id: 'pickup', label: 'Retirada', fromM: null, toM: null, pickup: true }, maxOrdersPerDay: worst.webagCents > 0 && facts.budgetDailyCents ? Math.floor(facts.budgetDailyCents / worst.webagCents) : null, maxOrdersTotal: worst.webagCents > 0 && facts.budgetTotalCents ? Math.floor(facts.budgetTotalCents / worst.webagCents) : null },
      maxCostCents: verdict.maxCostCents,
      estimatedOrders: firstDiscount && facts.budgetTotalCents ? Math.floor(facts.budgetTotalCents / firstDiscount) : null,
      globalBudget: global,
      aboveMargin: verdict.aboveMargin,
      blockers: verdict.blockers,
    };
  }

  // =================================================================== validação

  private validateRule(r: { funding: FundingSource; storeSharePct: number | undefined; kind: 'percent' | 'fixed' | 'free_shipping'; value: number; percentCapCents: number | null }): void {
    const problems: { field: string; message: string }[] = [];
    if (r.kind === 'free_shipping' && !['webag', 'self_funded'].includes(r.funding)) throw errors.unprocessable('FREE_SHIPPING_FUNDING_INVALID', 'Fonte inválida para frete grátis', { detail: 'O frete é da Webag.' });
    if (r.funding === 'split' && r.storeSharePct === undefined) problems.push({ field: 'storeSharePct', message: 'Informe a parte da loja (1 a 99%).' });
    if (r.funding !== 'split' && r.storeSharePct !== undefined) problems.push({ field: 'storeSharePct', message: 'A parte da loja só se informa na fonte Dividido (webag 0%, loja paga 100%, autofinanciado 0%).' });
    if (r.kind === 'percent' && (r.value < 1 || r.value > 100)) problems.push({ field: 'value', message: 'O percentual vai de 1 a 100.' });
    if (r.kind === 'fixed' && r.value < 1) problems.push({ field: 'value', message: 'Informe o valor do desconto em centavos.' });
    if (r.kind === 'free_shipping' && r.value !== 0) problems.push({ field: 'value', message: 'Frete grátis não leva valor.' });
    if (r.kind !== 'percent' && r.percentCapCents !== null) problems.push({ field: 'percentCapCents', message: 'O teto só vale para desconto percentual.' });
    if (problems.length > 0) throw errors.validation(problems);
    if (r.kind === 'percent' && ['webag', 'split'].includes(r.funding) && r.percentCapCents === null) throw errors.unprocessable('PERCENT_CAP_REQUIRED', 'Teto em reais obrigatório', { detail: 'Percentual com custo da Webag precisa de um teto em reais por pedido.' });
  }

  private targetColumns(target: { kind: 'all' | 'city' | 'store' | 'category'; cityId?: string | null | undefined; storeId?: string | null | undefined; categoryId?: string | null | undefined }) {
    const need = (v: string | null | undefined, field: string): string => {
      if (!v) throw errors.validation([{ field: `target.${field}`, message: 'Informe o alvo escolhido.' }]);
      return v;
    };
    return {
      targetKind: target.kind,
      targetCityId: target.kind === 'city' ? need(target.cityId, 'cityId') : null,
      targetStoreId: target.kind === 'store' ? need(target.storeId, 'storeId') : null,
      targetCategoryId: target.kind === 'category' ? need(target.categoryId, 'categoryId') : null,
    };
  }

  private shareOf(funding: FundingSource, storeSharePct: number | undefined): number {
    return funding === 'store' ? 100 : funding === 'split' ? storeSharePct! : 0;
  }

  // =================================================================== escrita

  private async mirror(tx: Tx, c: Campaign, active: boolean): Promise<void> {
    const now = new Date();
    await tx
      .update(coupons)
      .set({ kind: c.kind, value: c.value, percentCapCents: c.percentCapCents, minOrderCents: c.minOrderCents, startsAt: c.startsAt ?? now, endsAt: c.endsAt ?? new Date(now.getTime() + DAY_MS), maxUses: c.maxUses, perCustomerLimit: c.perCustomerLimit, firstPurchaseOnly: c.audience === 'first_purchase', scope: c.owner === 'store' ? 'store' : 'platform', storeId: c.owner === 'store' ? c.ownerStoreId : null, active })
      .where(eq(coupons.campaignId, c.id));
  }

  private async createCode(tx: Tx, c: Campaign, input: { code: string | null | undefined; codeVisibility: 'public' | 'private' }): Promise<void> {
    if (input.codeVisibility === 'private' && input.code) throw errors.unprocessable('PRIVATE_CODE_IS_GENERATED', 'Código privado é gerado pelo servidor', { detail: 'Não envie o código: o servidor gera um código aleatório para campanha privada.' });
    if (input.codeVisibility === 'public' && !input.code) return; // sem código a campanha não aparece sozinha
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = input.codeVisibility === 'private' ? generatePrivateCode() : input.code!;
      try {
        const now = new Date();
        await tx.insert(coupons).values({ code, kind: c.kind, scope: 'platform', value: c.value, percentCapCents: c.percentCapCents, minOrderCents: c.minOrderCents, startsAt: c.startsAt ?? now, endsAt: c.endsAt ?? new Date(now.getTime() + DAY_MS), maxUses: c.maxUses, perCustomerLimit: c.perCustomerLimit, firstPurchaseOnly: c.audience === 'first_purchase', active: false, campaignId: c.id, visibility: input.codeVisibility, codeOrigin: input.codeVisibility === 'private' ? 'generated' : 'manual' });
        return;
      } catch (error) {
        if (isUniqueViolation(error) && input.codeVisibility === 'private') continue;
        if (isUniqueViolation(error)) throw errors.conflict('COUPON_CODE_TAKEN', 'Esse código já existe', 'Escolha outro código.');
        throw error;
      }
    }
    throw new Error('não foi possível gerar um código único');
  }

  private idem<T>(principal: Principal, op: string, key: string | null, payload: unknown, fn: () => Promise<T>): Promise<T> {
    return this.idempotency.run(`admin-campaign:${principal.userId}:${op}`, key, payload, fn);
  }

  async create(ctx: RequestContext, principal: Principal, input: CampaignCreateInput, key: string) {
    return this.idem(principal, 'create', key, input, async () => {
      const funding = input.fundingSource;
      const kind = input.kind;
      this.validateRule({ funding, storeSharePct: input.storeSharePct, kind, value: input.value ?? 0, percentCapCents: input.percentCapCents ?? null });
      if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw errors.validation([{ field: 'endsAt', message: 'O fim precisa ser depois do início.' }]);
      const target = this.targetColumns(input.target);
      try {
        const id = await this.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(campaigns)
            .values({
              owner: 'webag', name: input.name, fundingSource: funding, storeSharePct: this.shareOf(funding, input.storeSharePct), kind, value: input.value ?? 0, percentCapCents: input.percentCapCents ?? null, minOrderCents: input.minOrderCents ?? 0,
              audience: input.audience, reactivationDays: input.reactivationDays, ...target, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, budgetTotalCents: input.budgetTotalCents ?? null, budgetDailyCents: input.budgetDailyCents ?? null,
              maxUses: input.maxUses ?? null, perCustomerLimit: input.perCustomerLimit, createdBy: principal.userId,
            })
            .returning();
          if (!row) throw new Error('campanha não criada');
          await this.createCode(tx, row, { code: input.code, codeVisibility: input.codeVisibility });
          await this.audit.record(tx, ctx, { action: 'campaign.create', targetType: 'campaign', targetId: row.id, after: this.auditView(row), reason: input.reason });
          return row.id;
        });
        return await this.get(principal.adminProfile, id);
      } catch (error) {
        if (isFkViolation(error)) throw errors.validation([{ field: 'target', message: 'O alvo escolhido não existe.' }]);
        throw error;
      }
    });
  }

  private auditView(c: Campaign): Record<string, unknown> {
    return { name: c.name, state: c.state, fundingSource: c.fundingSource, storeSharePct: c.storeSharePct, kind: c.kind, value: c.value, percentCapCents: c.percentCapCents, minOrderCents: c.minOrderCents, audience: c.audience, targetKind: c.targetKind, startsAt: c.startsAt, endsAt: c.endsAt, budgetTotalCents: c.budgetTotalCents, budgetDailyCents: c.budgetDailyCents, maxUses: c.maxUses, perCustomerLimit: c.perCustomerLimit, version: c.version };
  }

  private assertVersion(c: Campaign, expected: number): void {
    if (c.version !== expected) throw errors.conflict('CAMPAIGN_VERSION_CONFLICT', 'A campanha mudou', 'Alguém alterou esta campanha. Recarregue para ver a versão atual.', { currentVersion: c.version });
  }

  async update(ctx: RequestContext, principal: Principal, id: string, input: CampaignPatchInput, key: string | null) {
    return this.idem(principal, `update:${id}`, key, input, async () => {
      await this.db.transaction(async (tx) => {
        const before = await this.load(id, tx, true);
        if (before.owner === 'store') throw errors.notFound('Campanha não encontrada.');
        // D3: depois de `active` nada muda (o cliente viu a regra e a loja aceitou aquele texto); `ended` não reabre.
        if (before.state === 'active' || before.state === 'paused') throw errors.conflict('CAMPAIGN_IMMUTABLE', 'Campanha ativa não muda', 'Encerre e duplique a campanha para mudar a regra ou o orçamento.');
        if (before.state === 'ended') throw errors.conflict('CAMPAIGN_STATE_INVALID', 'Campanha encerrada', 'Campanha encerrada não reabre: duplique.');
        this.assertVersion(before, input.expectedVersion);
        const funding = input.fundingSource ?? before.fundingSource;
        const kind = input.kind ?? before.kind;
        const share = input.fundingSource !== undefined || input.storeSharePct !== undefined ? this.shareOf(funding, input.storeSharePct ?? (funding === 'split' ? before.storeSharePct : undefined)) : before.storeSharePct;
        const value = input.value ?? (input.kind === 'free_shipping' ? 0 : before.value);
        const cap = input.percentCapCents !== undefined ? input.percentCapCents : kind === 'percent' ? before.percentCapCents : null;
        this.validateRule({ funding, storeSharePct: funding === 'split' ? share : undefined, kind, value, percentCapCents: cap });
        const startsAt = input.startsAt ?? before.startsAt;
        const endsAt = input.endsAt ?? before.endsAt;
        if (startsAt && endsAt && endsAt <= startsAt) throw errors.validation([{ field: 'endsAt', message: 'O fim precisa ser depois do início.' }]);
        const target = input.target ? this.targetColumns(input.target) : {};
        // SEC-224: editar `scheduled` DEVOLVE a campanha a `draft` e zera quem ativou: nova ativação (com 2º fator) é obrigatória; os aceites das lojas zeram (a regra mudou).
        const backToDraft = before.state === 'scheduled';
        const [after] = await tx
          .update(campaigns)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}), fundingSource: funding, storeSharePct: share, kind, value, percentCapCents: cap,
            ...(input.minOrderCents !== undefined ? { minOrderCents: input.minOrderCents } : {}), ...(input.audience !== undefined ? { audience: input.audience } : {}), ...(input.reactivationDays !== undefined ? { reactivationDays: input.reactivationDays } : {}),
            ...target, startsAt, endsAt,
            ...(input.budgetTotalCents !== undefined ? { budgetTotalCents: input.budgetTotalCents } : {}), ...(input.budgetDailyCents !== undefined ? { budgetDailyCents: input.budgetDailyCents } : {}), ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}), ...(input.perCustomerLimit !== undefined ? { perCustomerLimit: input.perCustomerLimit } : {}),
            ...(backToDraft ? { state: 'draft' as const, activatedBy: null, activatedAt: null, lossRiskAckBy: null, stateChangedAt: new Date(), stateReason: 'Editada depois de agendada: precisa ser ativada de novo.' } : {}),
            version: sql`${campaigns.version} + 1`, updatedAt: new Date(),
          })
          .where(eq(campaigns.id, id))
          .returning();
        if (!after) throw new Error('campanha não atualizada');
        if (backToDraft) {
          await tx.update(campaignStoreEnrollments).set({ state: 'pending', respondedAt: null, respondedBy: null, monthlyCapCents: null, termsVersion: null, termsHash: null }).where(and(eq(campaignStoreEnrollments.campaignId, id), eq(campaignStoreEnrollments.state, 'accepted')));
        }
        // código: troca de visibilidade ou de código só em rascunho (as linhas de `coupons` são espelhos inativos até ativar)
        if (input.code !== undefined || input.codeVisibility !== undefined) {
          const [existing] = await tx.select().from(coupons).where(eq(coupons.campaignId, id));
          if (existing && (input.code === null || (input.code !== undefined && input.code !== existing.code) || (input.codeVisibility !== undefined && input.codeVisibility !== existing.visibility))) {
            await tx.delete(coupons).where(and(eq(coupons.campaignId, id), eq(coupons.active, false)));
          }
          const [still] = await tx.select({ id: coupons.id }).from(coupons).where(eq(coupons.campaignId, id));
          if (!still) await this.createCode(tx, after, { code: input.code ?? null, codeVisibility: input.codeVisibility ?? 'public' });
        }
        await this.mirror(tx, after, false);
        await this.audit.record(tx, ctx, { action: 'campaign.update', targetType: 'campaign', targetId: id, before: this.auditView(before), after: this.auditView(after), reason: input.reason });
      });
      return this.get(principal.adminProfile, id);
    });
  }

  /** 2º fator recente (até `reauth_min`): quem exige é a FONTE gravada (custo da Webag), nunca o corpo da requisição (Q8). */
  private async requireRecentReauth(principal: Principal): Promise<void> {
    const windowMs = (await this.params.getNumber('reauth_min')) * 60_000;
    if (!principal.reauthAt || Date.now() - principal.reauthAt.getTime() > windowMs) throw errors.forbidden('REAUTH_REQUIRED', 'Confirme sua identidade para continuar.');
  }

  private blocked(blockers: ActivationBlocker[]): AppError {
    return new AppError(422, 'ACTIVATION_BLOCKED', 'A campanha não pode ser ativada', { detail: 'Resolva os itens abaixo para ativar.', extensions: { blockers } });
  }

  /** A trava única do orçamento mensal global (Q14): 2 ativações em paralelo não passam dele. Ordem: este advisory ANTES da linha da campanha. */
  private lockGlobalBudget(tx: Tx): Promise<unknown> {
    return tx.execute(sql`select pg_advisory_xact_lock(hashtext('campaign-global-budget'))`);
  }

  /** Conferências da ativação (e da retomada, e da varredura): TUDO de novo, sob a trava, sem confiar na simulação. */
  private async verdictFor(tx: Tx, c: Campaign, principal: Principal | null, acknowledgeLossRisk: boolean | undefined): Promise<ActivationBlocker[]> {
    const ctx = await this.activationContext(c.id, await this.acceptedStores(c.id, tx), tx);
    const verdict = checkActivation(this.factsOf(c), ctx);
    let blockers = verdict.blockers;
    if (verdict.aboveMargin) {
      const superAdmin = principal ? principal.adminProfile === 'super_admin' : true; // a varredura herda a decisão gravada na ativação
      const acknowledged = principal ? acknowledgeLossRisk === true : c.lossRiskAckBy !== null;
      blockers = blockers.filter((b) => b.code !== 'ABOVE_MARGIN_SUPER_ADMIN_ONLY' || !superAdmin);
      if (!acknowledged && superAdmin) blockers = [...blockers, { code: 'LOSS_RISK_ACK_REQUIRED', message: 'Confirme que a campanha pode gerar prejuízo por pedido.' }];
      if (principal && principal.adminProfile !== 'super_admin' && !blockers.some((b) => b.code === 'ABOVE_MARGIN_SUPER_ADMIN_ONLY')) blockers = [...blockers, { code: 'ABOVE_MARGIN_SUPER_ADMIN_ONLY', message: 'O desconto da Webag fica acima da margem prevista em alguma faixa: só o super admin ativa.' }];
    }
    return blockers;
  }

  async activate(ctx: RequestContext, principal: Principal, id: string, input: { reason: string; expectedVersion: number; acknowledgeLossRisk?: boolean | undefined }, key: string | null) {
    return this.idem(principal, `activate:${id}`, key, input, async () => {
      const [pre] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
      if (!pre || pre.owner === 'store') throw errors.notFound('Campanha não encontrada.');
      if (hasWebagCost(pre.fundingSource)) await this.requireRecentReauth(principal);
      await this.db.transaction(async (tx) => {
        await this.lockGlobalBudget(tx);
        const before = await this.load(id, tx, true);
        if (before.state === 'active' || before.state === 'scheduled') {
          if (before.version === input.expectedVersion + 1) return; // repetição da mesma ativação
        }
        if (before.state !== 'draft') throw errors.conflict('CAMPAIGN_STATE_INVALID', 'Estado inválido', 'Só rascunho se ativa; campanha pausada se retoma.');
        this.assertVersion(before, input.expectedVersion);
        const blockers = await this.verdictFor(tx, before, principal, input.acknowledgeLossRisk);
        if (blockers.length > 0) throw this.blocked(blockers);
        const now = new Date();
        const scheduled = before.startsAt !== null && before.startsAt > now;
        const [after] = await tx
          .update(campaigns)
          .set({ state: scheduled ? 'scheduled' : 'active', activatedBy: principal.userId, activatedAt: now, lossRiskAckBy: input.acknowledgeLossRisk ? principal.userId : null, stateChangedAt: now, stateReason: input.reason, version: sql`${campaigns.version} + 1`, updatedAt: now })
          .where(eq(campaigns.id, id))
          .returning();
        await this.mirror(tx, after!, true);
        await this.audit.record(tx, ctx, { action: 'campaign.activate', targetType: 'campaign', targetId: id, before: this.auditView(before), after: this.auditView(after!), reason: input.reason });
      });
      return this.get(principal.adminProfile, id);
    });
  }

  async pause(ctx: RequestContext, principal: Principal, id: string, reason: string, key: string | null) {
    return this.idem(principal, `pause:${id}`, key, { reason }, async () => {
      await this.db.transaction(async (tx) => {
        const before = await this.load(id, tx, true);
        if (before.state === 'paused') return;
        if (before.state !== 'active') throw errors.conflict('CAMPAIGN_STATE_INVALID', 'Estado inválido', 'Só campanha ativa pausa.');
        const now = new Date();
        const [after] = await tx.update(campaigns).set({ state: 'paused', pausedBy: 'admin', stateReason: reason, stateChangedAt: now, version: sql`${campaigns.version} + 1`, updatedAt: now }).where(eq(campaigns.id, id)).returning();
        await this.audit.record(tx, ctx, { action: 'campaign.pause', targetType: 'campaign', targetId: id, before: { state: before.state }, after: { state: after!.state }, reason });
      });
      return this.get(principal.adminProfile, id);
    });
  }

  async resume(ctx: RequestContext, principal: Principal, id: string, input: { reason: string; expectedVersion: number; acknowledgeLossRisk?: boolean | undefined }, key: string | null) {
    return this.idem(principal, `resume:${id}`, key, input, async () => {
      const [pre] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
      if (!pre || pre.owner === 'store') throw errors.notFound('Campanha não encontrada.');
      if (hasWebagCost(pre.fundingSource)) await this.requireRecentReauth(principal);
      await this.db.transaction(async (tx) => {
        await this.lockGlobalBudget(tx);
        const before = await this.load(id, tx, true);
        if (before.state !== 'paused') throw errors.conflict('CAMPAIGN_STATE_INVALID', 'Estado inválido', 'Só campanha pausada se retoma.');
        this.assertVersion(before, input.expectedVersion);
        if (before.endsAt && before.endsAt <= new Date()) throw errors.conflict('CAMPAIGN_EXPIRED', 'Campanha vencida', 'A validade acabou: duplique a campanha.');
        const blockers = await this.verdictFor(tx, before, principal, input.acknowledgeLossRisk ?? before.lossRiskAckBy !== null);
        if (blockers.length > 0) throw this.blocked(blockers);
        const now = new Date();
        const [after] = await tx.update(campaigns).set({ state: 'active', pausedBy: null, stateReason: input.reason, stateChangedAt: now, version: sql`${campaigns.version} + 1`, updatedAt: now }).where(eq(campaigns.id, id)).returning();
        await this.audit.record(tx, ctx, { action: 'campaign.resume', targetType: 'campaign', targetId: id, before: { state: before.state }, after: { state: after!.state }, reason: input.reason });
      });
      return this.get(principal.adminProfile, id);
    });
  }

  async end(ctx: RequestContext, principal: Principal, id: string, reason: string, key: string | null) {
    return this.idem(principal, `end:${id}`, key, { reason }, async () => {
      const [pre] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
      if (!pre || pre.owner === 'store') throw errors.notFound('Campanha não encontrada.');
      if (pre.state !== 'ended' && hasWebagCost(pre.fundingSource) && pre.state !== 'draft') await this.requireRecentReauth(principal);
      await this.db.transaction(async (tx) => {
        const before = await this.load(id, tx, true);
        if (before.state === 'ended') return;
        if (before.state === 'draft') throw errors.conflict('CAMPAIGN_STATE_INVALID', 'Estado inválido', 'Rascunho não se encerra: edite ou duplique.');
        await this.finish(tx, before, 'admin', reason);
        await this.audit.record(tx, ctx, { action: 'campaign.end', targetType: 'campaign', targetId: id, before: { state: before.state }, after: { state: 'ended', endReason: 'admin' }, reason });
      });
      return this.get(principal.adminProfile, id);
    });
  }

  /** Encerra (terminal): os códigos deixam de valer; reservas em aberto seguem seu curso (pedido criado mantém o desconto). */
  private async finish(tx: Tx, c: Campaign, endReason: 'budget' | 'uses' | 'expired' | 'admin', reason: string): Promise<void> {
    const now = new Date();
    await tx.update(campaigns).set({ state: 'ended', endReason, endedAt: now, pausedBy: null, stateReason: reason, stateChangedAt: now, version: sql`${campaigns.version} + 1`, updatedAt: now }).where(eq(campaigns.id, c.id));
    await tx.update(coupons).set({ active: false }).where(eq(coupons.campaignId, c.id));
  }

  /** Duplicar (WB-349 C6, DEC-107): rascunho com as regras e SEM orçamento, validade, código nem convites. Campanha de loja não duplica pelo admin (404). */
  async duplicate(ctx: RequestContext, principal: Principal, id: string, reason: string, key: string) {
    return this.idem(principal, `duplicate:${id}`, key, { reason }, async () => {
      const newId = await this.db.transaction(async (tx) => {
        const source = await this.load(id, tx);
        if (source.owner === 'store') throw errors.notFound('Campanha não encontrada.');
        const [row] = await tx
          .insert(campaigns)
          .values({ owner: 'webag', name: `${source.name} (cópia)`.slice(0, 80), fundingSource: source.fundingSource, storeSharePct: source.storeSharePct, kind: source.kind, value: source.value, percentCapCents: source.percentCapCents, minOrderCents: source.minOrderCents, audience: source.audience, reactivationDays: source.reactivationDays, targetKind: source.targetKind, targetCityId: source.targetCityId, targetStoreId: source.targetStoreId, targetCategoryId: source.targetCategoryId, perCustomerLimit: source.perCustomerLimit, createdBy: principal.userId, duplicatedFrom: source.id })
          .returning();
        await this.audit.record(tx, ctx, { action: 'campaign.duplicate', targetType: 'campaign', targetId: row!.id, after: { duplicatedFrom: source.id, ...this.auditView(row!) }, reason });
        return row!.id;
      });
      return this.get(principal.adminProfile, newId);
    });
  }

  // =================================================================== varredura (1 minuto)

  /**
   * (a) `scheduled -> active` quando chega a hora, REPETINDO as conferências da ativação (SEC-224, Q1: orçamento global do mês em que entra no ar, flags, aceite da loja); falhou: continua
   * `scheduled` e o alerta `activation_blocked` aparece; (b) encerra por validade, orçamento (gasto confirmado >= total) ou usos; (c) expurga o antifraude acima da retenção.
   */
  async sweep(now = new Date()): Promise<{ activated: number; ended: number; purged: number }> {
    let activated = 0;
    let ended = 0;
    const due = await this.db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.state, 'scheduled'), sql`${campaigns.startsAt} <= ${now}`));
    for (const { id } of due) {
      await this.db.transaction(async (tx) => {
        await this.lockGlobalBudget(tx);
        const c = await this.load(id, tx, true);
        if (c.state !== 'scheduled' || !c.startsAt || c.startsAt > now) return;
        if ((await this.verdictFor(tx, c, null, undefined)).length > 0) return;
        await tx.update(campaigns).set({ state: 'active', stateChangedAt: now, version: sql`${campaigns.version} + 1`, updatedAt: now }).where(eq(campaigns.id, id));
        activated += 1;
      });
    }
    const live = await this.db.select({ id: campaigns.id }).from(campaigns).where(and(inArray(campaigns.state, ['active', 'paused']), sql`(${campaigns.endsAt} <= ${now} or (${campaigns.budgetTotalCents} is not null and ${campaigns.budgetSpentCents} >= ${campaigns.budgetTotalCents}) or (${campaigns.maxUses} is not null and ${campaigns.usesConfirmed} >= ${campaigns.maxUses}))`));
    for (const { id } of live) {
      await this.db.transaction(async (tx) => {
        const c = await this.load(id, tx, true);
        if (c.state !== 'active' && c.state !== 'paused') return;
        const reason = c.endsAt && c.endsAt <= now ? 'expired' : c.budgetTotalCents !== null && c.budgetSpentCents >= c.budgetTotalCents ? 'budget' : c.maxUses !== null && c.usesConfirmed >= c.maxUses ? 'uses' : null;
        if (!reason) return;
        await this.finish(tx, c, reason, reason === 'expired' ? 'Validade encerrada' : reason === 'budget' ? 'Orçamento esgotado' : 'Usos esgotados');
        ended += 1;
      });
    }
    const months = await this.params.getNumber('cupom_fraude_retencao_meses');
    const cutoff = new Date(now.getTime() - months * 30 * DAY_MS);
    const purged = await this.db.transaction(async (tx) => {
      const a = await tx.delete(couponFraudClaims).where(lt(couponFraudClaims.createdAt, cutoff)).returning({ id: couponFraudClaims.id });
      const b = await tx.delete(couponIdentifierSightings).where(lt(couponIdentifierSightings.lastSeenAt, cutoff)).returning({ id: couponIdentifierSightings.id });
      const c = await tx.delete(couponFraudSignals).where(lt(couponFraudSignals.detectedAt, cutoff)).returning({ id: couponFraudSignals.id });
      return a.length + b.length + c.length;
    });
    return { activated, ended, purged };
  }

  // =================================================================== alertas e "Suspeitos"

  /** Alertas CALCULADOS na leitura (nenhuma tabela nova; o texto não leva dado pessoal). */
  async alerts(query: { cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const offset = Number(decodeCursor<{ o: number }>(query.cursor)?.o ?? 0);
    const rows = await this.db.select().from(campaigns).where(inArray(campaigns.state, ['scheduled', 'active', 'paused']));
    const ids = rows.map((r) => r.id);
    const days = ids.length === 0 ? [] : (await this.db.execute<{ campaign_id: string; reserved: number; spent: number; limit_cents: number }>(sql`select campaign_id, reserved_cents as reserved, spent_cents as spent, limit_cents from campaign_budget_days where campaign_id in (${uuidList(ids)}) and day = (now() at time zone 'America/Sao_Paulo')::date`)).rows;
    const open = ids.length === 0 ? [] : (await this.db.execute<{ campaign_id: string; n: number }>(sql`select campaign_id, count(*)::int as n from coupon_fraud_signals where campaign_id in (${uuidList(ids)}) and detected_at > now() - interval '7 days' group by campaign_id`)).rows;
    const uses7 = ids.length === 0 ? [] : (await this.db.execute<{ campaign_id: string; n: number }>(sql`select campaign_id, count(*)::int as n from coupon_reservations where campaign_id in (${uuidList(ids)}) and reserved_at > now() - interval '7 days' group by campaign_id`)).rows;
    const violations = (await this.db.execute<{ campaign_id: string }>(sql`select distinct campaign_id from campaign_budget_violations()`)).rows;
    const pct = await this.params.getNumber('cupom_suspeitos_alerta_pct');
    const out: { id: string; kind: string; campaignId: string; campaignName: string; severity: 'info' | 'warning' | 'critical'; scope: 'total' | 'day' | null; valueCents: number | null; detail: string; createdAt: string }[] = [];
    const push = (c: Campaign, kind: string, severity: 'info' | 'warning' | 'critical', scope: 'total' | 'day' | null, valueCents: number | null, detail: string): void => {
      const id = createHash('sha256').update(`${c.id}:${kind}:${scope ?? ''}`).digest('hex');
      out.push({ id: `${id.slice(0, 8)}-${id.slice(8, 12)}-5${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`, kind, campaignId: c.id, campaignName: c.name, severity, scope, valueCents, detail, createdAt: c.updatedAt.toISOString() });
    };
    for (const c of rows) {
      if (c.state === 'active' && c.budgetTotalCents) {
        const used = c.budgetReservedCents + c.budgetSpentCents;
        if (used >= c.budgetTotalCents) push(c, 'budget_100', 'critical', 'total', used, 'O orçamento total da campanha acabou.');
        else if (used * 100 >= c.budgetTotalCents * 80) push(c, 'budget_80', 'warning', 'total', used, 'O orçamento total chegou a 80%.');
        const d = days.find((x) => x.campaign_id === c.id);
        if (d && d.limit_cents > 0) {
          const dayUsed = d.reserved + d.spent;
          if (dayUsed >= d.limit_cents) push(c, 'budget_100', 'critical', 'day', dayUsed, 'O orçamento de hoje acabou.');
          else if (dayUsed * 100 >= d.limit_cents * 80) push(c, 'budget_80', 'warning', 'day', dayUsed, 'O orçamento de hoje chegou a 80%.');
        }
      }
      if (c.state === 'active' && c.activatedAt && c.activatedAt.getTime() < Date.now() - 30 * DAY_MS && c.usesReserved + c.usesConfirmed === 0) push(c, 'no_use_30d', 'info', null, null, 'Ativa há mais de 30 dias sem nenhum uso.');
      const suspects = open.find((x) => x.campaign_id === c.id)?.n ?? 0;
      const uses = uses7.find((x) => x.campaign_id === c.id)?.n ?? 0;
      if (uses > 0 && suspects * 100 > uses * pct) push(c, 'suspect_over_20pct', 'warning', null, null, `Mais de ${pct}% dos usos dos últimos 7 dias estão como suspeitos: avalie pausar.`);
      if (c.state === 'scheduled' && c.startsAt && c.startsAt <= new Date()) push(c, 'activation_blocked', 'critical', null, null, 'Chegou a hora de entrar no ar, mas as conferências da ativação falharam (orçamento global, flags ou aceite da loja).');
    }
    for (const v of violations) {
      const c = (await this.db.select().from(campaigns).where(eq(campaigns.id, v.campaign_id)))[0];
      if (c) push(c, 'report_unreconciled', 'critical', null, null, 'O orçamento não bate com o diário e as reservas: a conciliação precisa de revisão.');
    }
    const order = { critical: 0, warning: 1, info: 2 } as const;
    out.sort((a, b) => order[a.severity] - order[b.severity] || a.campaignName.localeCompare(b.campaignName));
    const data = out.slice(offset, offset + limit);
    return { data, nextCursor: offset + limit < out.length ? encodeCursor({ o: offset + limit }) : null };
  }

  async suspects(query: { state: 'open' | 'released'; campaignId?: string | undefined; cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const where: (SQL | undefined)[] = [eq(couponFraudSignals.state, query.state)];
    if (query.campaignId) where.push(eq(couponFraudSignals.campaignId, query.campaignId));
    if (cursor) where.push(sql`(${couponFraudSignals.detectedAt}, ${couponFraudSignals.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`);
    const rows = await this.db.select({ signal: couponFraudSignals, campaignName: campaigns.name }).from(couponFraudSignals).innerJoin(campaigns, eq(campaigns.id, couponFraudSignals.campaignId)).where(and(...where)).orderBy(desc(couponFraudSignals.detectedAt), desc(couponFraudSignals.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const numbers = await this.orderNumbers(page.map((r) => r.signal.orderId));
    const last = page.at(-1)?.signal;
    return { data: page.map((r) => this.suspectView(r.signal, r.campaignName, numbers.get(r.signal.orderId) ?? '')), nextCursor: rows.length > limit && last ? encodeCursor({ at: last.detectedAt.toISOString(), id: last.id }) : null };
  }

  /** Leitura do número público do pedido (opaco, sem dado pessoal), por SQL de leitura: `campaigns` não importa `orders` (B2). */
  private async orderNumbers(orderIds: string[]): Promise<Map<string, string>> {
    if (orderIds.length === 0) return new Map();
    const res = await this.db.execute<{ id: string; number: string }>(sql`select id, number from orders where id in (${uuidList(orderIds)})`);
    return new Map(res.rows.map((r) => [r.id, r.number]));
  }

  private suspectView(s: typeof couponFraudSignals.$inferSelect, campaignName: string, orderNumber: string) {
    return { id: s.id, orderNumber, campaignId: s.campaignId, campaignName, signal: s.signal, state: s.state, detectedAt: s.detectedAt.toISOString(), releasedAt: s.releasedAt?.toISOString() ?? null };
  }

  async releaseSuspect(ctx: RequestContext, principal: Principal, id: string, reason: string, key: string | null) {
    return this.idem(principal, `release-suspect:${id}`, key, { reason }, async () =>
      this.db.transaction(async (tx) => {
        const [row] = await tx.select({ signal: couponFraudSignals, campaignName: campaigns.name }).from(couponFraudSignals).innerJoin(campaigns, eq(campaigns.id, couponFraudSignals.campaignId)).where(eq(couponFraudSignals.id, id)).for('update', { of: couponFraudSignals });
        if (!row) throw errors.notFound('Sinal não encontrado.');
        let signal = row.signal;
        if (signal.state === 'open') {
          const [updated] = await tx.update(couponFraudSignals).set({ state: 'released', releasedBy: principal.userId, releasedAt: new Date(), releaseReason: reason }).where(and(eq(couponFraudSignals.id, id), eq(couponFraudSignals.state, 'open'))).returning();
          if (updated) {
            signal = updated;
            await this.audit.record(tx, ctx, { action: 'suspect.release', targetType: 'coupon_suspect', targetId: id, after: { signal: signal.signal, campaignId: signal.campaignId }, reason });
          }
        }
        const numbers = await this.orderNumbers([signal.orderId]);
        return this.suspectView(signal, row.campaignName, numbers.get(signal.orderId) ?? '');
      }),
    );
  }
}

const isFkViolation = (error: unknown): boolean => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === '23503';
};

const summaryOf = <T extends Record<string, unknown>>(view: T) => {
  const { kind: _k, value: _v, percentCapCents: _p, minOrderCents: _m, audience: _a, reactivationDays: _r, target: _t, perCustomerLimit: _l, codes: _c, activation: _ac, courierCostProvisional: _cp, createdAt: _ca, activatedAt: _aa, ...summary } = view;
  void [_k, _v, _p, _m, _a, _r, _t, _l, _c, _ac, _cp, _ca, _aa];
  return summary;
};
