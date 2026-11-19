import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { cities, neighborhoods } from '../admin/db/schema.js';
import { DeliveryQuoteRegistry, StoresService } from '../stores/index.js';
import { deliveryFeeTables, deliveryFeeTiers } from './db/schema.js';
import { applyFreeShipping, pickTier, startingFee, validateFeeTiers, type FeeScopeType, type FeeTier } from './domain/fees.js';

export type FeeTable = typeof deliveryFeeTables.$inferSelect & { tiers: FeeTier[] };
export interface Destination {
  lat: number;
  lng: number;
  cityId?: string | null;
  neighborhoodId?: string | null;
}

/** Foto da faixa usada, gravada no pedido (RN-05): mudar a tabela depois não altera pedido já feito. */
export interface DeliveryFeeSnapshot {
  tableId: string;
  scopeType: FeeScopeType;
  scopeKey: string;
  version: number;
  tierPosition: number;
  distanceM: number;
  baseFeeCents: number;
  exchangeFeeCents: number;
  expectedCostCents: number;
  etaMinutes: number;
}

export interface DeliveryQuote {
  available: boolean;
  reason: 'OUT_OF_RANGE' | 'NO_FEE_TABLE' | null;
  distanceM: number | null;
  /** Taxa cobrada do cliente, já com a entrega grátis aplicada. */
  feeCents: number | null;
  freeShipping: boolean;
  minOrderCents: number;
  belowMinimum: boolean;
  etaMinutes: number | null;
  snapshot: DeliveryFeeSnapshot | null;
}

export interface FeeTableInput {
  scopeType: FeeScopeType;
  scopeId?: string | null;
  tiers: FeeTier[];
  effectiveFrom?: Date | undefined;
  reason: string;
  expectedVersion: number;
}

const DEFAULT_KEY = 'default';

/**
 * Tabela de taxa de entrega do admin (L.1, DEC-036): a taxa é da Webag, vem do ENDEREÇO DE DESTINO (bairro > cidade >
 * padrão) e da faixa de distância em linha reta loja-destino; o raio é global (`raio_max_km`). Uma só função
 * (`quote`) serve o carrinho, o checkout e a prévia do admin, então os valores não divergem.
 */
@Injectable()
export class DeliveryFeesService implements OnModuleInit {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
    private readonly stores: StoresService,
    private readonly registry: DeliveryQuoteRegistry,
  ) {}

  /** A prévia do painel do lojista usa a MESMA conta (cidade da loja como destino aproximado, sem endereço). */
  onModuleInit(): void {
    this.registry.register(async (storeId, point, subtotalCents) => {
      const store = await this.stores.getStore(storeId);
      const quote = await this.quote(storeId, { ...point, cityId: store.addressCityId ?? null }, subtotalCents);
      return { available: quote.available, distanceM: quote.distanceM, feeCents: quote.feeCents, freeShipping: quote.freeShipping, belowMinimum: quote.belowMinimum };
    });
  }

  private async tiersOf(tableIds: string[]): Promise<Map<string, FeeTier[]>> {
    const rows = tableIds.length ? await this.db.select().from(deliveryFeeTiers).where(inArray(deliveryFeeTiers.tableId, tableIds)).orderBy(deliveryFeeTiers.tableId, deliveryFeeTiers.position) : [];
    const map = new Map<string, FeeTier[]>();
    for (const r of rows) (map.get(r.tableId) ?? map.set(r.tableId, []).get(r.tableId)!).push({ fromM: r.fromM, toM: r.toM, feeCents: r.feeCents, exchangeFeeCents: r.exchangeFeeCents, expectedCostCents: r.expectedCostCents, etaMinutes: r.etaMinutes });
    return map;
  }

  /** Versão em vigor de cada escopo pedido (a de maior `effective_from` já alcançado). */
  private async inForce(keys: string[], now: Date): Promise<Map<string, FeeTable>> {
    if (keys.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([deliveryFeeTables.scopeKey])
      .from(deliveryFeeTables)
      .where(and(inArray(deliveryFeeTables.scopeKey, keys), lte(deliveryFeeTables.effectiveFrom, now)))
      .orderBy(deliveryFeeTables.scopeKey, desc(deliveryFeeTables.effectiveFrom), desc(deliveryFeeTables.version));
    const tiers = await this.tiersOf(rows.map((r) => r.id));
    return new Map(rows.map((r) => [r.scopeKey, { ...r, tiers: tiers.get(r.id) ?? [] }]));
  }

  /** Tabela do destino: bairro > cidade > padrão geral (WB-236 C2). */
  async resolve(destination: Pick<Destination, 'cityId' | 'neighborhoodId'>, now = new Date()): Promise<FeeTable | null> {
    const keys = [destination.neighborhoodId, destination.cityId, DEFAULT_KEY].filter((k): k is string => !!k);
    const found = await this.inForce(keys, now);
    for (const key of keys) {
      const table = found.get(key);
      if (table) return table;
    }
    return null;
  }

  async quote(storeId: string, destination: Destination, subtotalCents: number, now = new Date()): Promise<DeliveryQuote> {
    const [radiusKm, minOrderCents, freeAbove] = await Promise.all([this.params.getNumber('raio_max_km'), this.params.getNumber('pedido_minimo_cents'), this.params.getNumber('frete_gratis_acima_cents')]);
    const belowMinimum = subtotalCents < minOrderCents;
    const base = { minOrderCents, belowMinimum };
    const distance = await this.stores.distanceMeters(storeId, destination);
    if (distance === null) return { ...base, available: false, reason: 'OUT_OF_RANGE', distanceM: null, feeCents: null, freeShipping: false, etaMinutes: null, snapshot: null };
    const distanceM = Math.round(distance);
    if (distanceM > radiusKm * 1000) return { ...base, available: false, reason: 'OUT_OF_RANGE', distanceM, feeCents: null, freeShipping: false, etaMinutes: null, snapshot: null };
    const table = await this.resolve(destination, now);
    const picked = table ? pickTier(table.tiers, distanceM) : null;
    if (!table || !picked) return { ...base, available: false, reason: table ? 'OUT_OF_RANGE' : 'NO_FEE_TABLE', distanceM, feeCents: null, freeShipping: false, etaMinutes: null, snapshot: null };
    const fee = applyFreeShipping(picked.tier.feeCents, subtotalCents, freeAbove);
    return {
      ...base,
      available: true,
      reason: null,
      distanceM,
      feeCents: fee,
      freeShipping: fee === 0 && picked.tier.feeCents > 0,
      etaMinutes: picked.tier.etaMinutes,
      snapshot: { tableId: table.id, scopeType: table.scopeType, scopeKey: table.scopeKey, version: table.version, tierPosition: picked.position, distanceM, baseFeeCents: picked.tier.feeCents, exchangeFeeCents: picked.tier.exchangeFeeCents, expectedCostCents: picked.tier.expectedCostCents, etaMinutes: picked.tier.etaMinutes },
    };
  }

  /** "A partir de R$ X" enquanto o endereço é aproximado (WB-237 C1): menor faixa da tabela da cidade (ou do padrão). */
  async startingFeeFor(cityId: string | null, now = new Date()): Promise<number | null> {
    const table = await this.resolve({ cityId, neighborhoodId: null }, now);
    return table ? startingFee(table.tiers) : null;
  }

  // ------------------------------------------------------------------ admin

  private async scopeKeyOf(scopeType: FeeScopeType, scopeId: string | null | undefined): Promise<string> {
    if (scopeType === 'default') return DEFAULT_KEY;
    if (!scopeId) throw errors.validation([{ field: 'scopeId', message: 'Informe a cidade ou o bairro.' }]);
    const table = scopeType === 'city' ? cities : neighborhoods;
    const [row] = await this.db.select({ id: table.id }).from(table).where(eq(table.id, scopeId));
    if (!row) throw errors.notFound(scopeType === 'city' ? 'Cidade não encontrada.' : 'Bairro não encontrado.');
    return scopeId;
  }

  /** Cria uma VERSÃO nova da tabela do escopo (histórico; não é retroativa). 409 se outro admin gravou antes. */
  async put(input: FeeTableInput, ctx: RequestContext): Promise<FeeTable> {
    const scopeKey = await this.scopeKeyOf(input.scopeType, input.scopeId);
    const [radiusKm, exchangeMax] = await Promise.all([this.params.getNumber('raio_max_km'), this.params.getNumber('taxa_coleta_max_cents')]);
    const problem = validateFeeTiers(input.tiers, radiusKm * 1000, exchangeMax);
    if (problem) throw errors.unprocessable('FEE_TABLE_INVALID', 'Tabela de taxa inválida', { detail: problem, errors: [{ field: 'tiers', message: problem }] });
    const now = new Date();
    const effectiveFrom = input.effectiveFrom ?? now;
    if (effectiveFrom.getTime() < now.getTime() - 60_000) throw errors.unprocessable('FEE_TABLE_RETROACTIVE', 'A tabela não é retroativa', { detail: 'A vigência não pode estar no passado.' });
    if (effectiveFrom.getTime() > now.getTime() + 90 * 86_400_000) throw errors.unprocessable('FEE_TABLE_TOO_FAR', 'Vigência distante demais', { detail: 'A vigência vai até 90 dias à frente.' });

    const created = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`delivery-fee-table:${scopeKey}`}))`);
      const [latest] = await tx.select({ version: deliveryFeeTables.version }).from(deliveryFeeTables).where(eq(deliveryFeeTables.scopeKey, scopeKey)).orderBy(desc(deliveryFeeTables.version)).limit(1);
      const current = latest?.version ?? 0;
      if (current !== input.expectedVersion) throw errors.conflict('FEE_TABLE_CONFLICT', 'Tabela alterada por outra pessoa', 'Outro admin alterou esta tabela. Recarregue para ver a versão atual.');
      const [table] = await tx
        .insert(deliveryFeeTables)
        .values({ scopeType: input.scopeType, scopeKey, version: current + 1, effectiveFrom, reason: input.reason, createdBy: ctx.principal?.userId ?? null })
        .returning();
      const sorted = [...input.tiers].sort((a, b) => a.fromM - b.fromM);
      await tx.insert(deliveryFeeTiers).values(sorted.map((t, position) => ({ tableId: table!.id, position, fromM: t.fromM, toM: t.toM, feeCents: t.feeCents, exchangeFeeCents: t.exchangeFeeCents, expectedCostCents: t.expectedCostCents, etaMinutes: t.etaMinutes })));
      await this.audit.record(tx, ctx, { action: 'delivery_fee_table.set', targetType: 'delivery_fee_table', targetId: table!.id, after: { scopeType: input.scopeType, scopeKey, version: current + 1, effectiveFrom: effectiveFrom.toISOString(), tiers: sorted }, reason: input.reason });
      return { ...table!, tiers: sorted };
    });
    return created;
  }

  /** Tabelas em vigor, uma por escopo, mais recentes primeiro (paginação por cursor em `created_at`/`id`). */
  async list(): Promise<(FeeTable & { scopeName: string })[]> {
    const rows = await this.db.selectDistinctOn([deliveryFeeTables.scopeKey]).from(deliveryFeeTables).where(lte(deliveryFeeTables.effectiveFrom, new Date())).orderBy(deliveryFeeTables.scopeKey, desc(deliveryFeeTables.effectiveFrom), desc(deliveryFeeTables.version));
    const tiers = await this.tiersOf(rows.map((r) => r.id));
    const names = await this.scopeNames(rows);
    return rows.map((r) => ({ ...r, tiers: tiers.get(r.id) ?? [], scopeName: names.get(r.scopeKey) ?? (r.scopeType === 'default' ? 'Padrão geral' : r.scopeKey) }));
  }

  /** Histórico de versões do escopo (inclui as futuras), da mais nova à mais antiga. */
  async history(scopeType: FeeScopeType, scopeId: string | null): Promise<FeeTable[]> {
    const scopeKey = await this.scopeKeyOf(scopeType, scopeId);
    const rows = await this.db.select().from(deliveryFeeTables).where(eq(deliveryFeeTables.scopeKey, scopeKey)).orderBy(desc(deliveryFeeTables.version)).limit(50);
    const tiers = await this.tiersOf(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, tiers: tiers.get(r.id) ?? [] }));
  }

  private async scopeNames(rows: (typeof deliveryFeeTables.$inferSelect)[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const cityIds = rows.filter((r) => r.scopeType === 'city').map((r) => r.scopeKey);
    const hoodIds = rows.filter((r) => r.scopeType === 'neighborhood').map((r) => r.scopeKey);
    if (cityIds.length) for (const c of await this.db.select({ id: cities.id, name: cities.name }).from(cities).where(inArray(cities.id, cityIds))) map.set(c.id, c.name);
    if (hoodIds.length) for (const n of await this.db.select({ id: neighborhoods.id, name: neighborhoods.name }).from(neighborhoods).where(inArray(neighborhoods.id, hoodIds))) map.set(n.id, n.name);
    return map;
  }
}
