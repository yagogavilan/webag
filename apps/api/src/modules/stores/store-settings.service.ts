import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { storeActivity, storeDeliveryTiers, storeHolidays, storeHours, storeSettings, type stores } from './db/schema.js';
import { applyFreeShipping, deliveryFee, MAX_FIXED_FEE_CENTS, validateFreeAbove, validateTiers, type Tier } from './domain/delivery.js';
import { isOpenNow, pauseUntil, validateDayIntervals, type Interval, type PauseKind, type WeeklyHours } from './domain/hours.js';
import { GEOCODING_PROVIDER, type GeocodingProvider } from './geocoding.js';
import type { DeliveryInput } from './stores.schemas.js';
import { StoresService } from './stores.service.js';

type Store = typeof stores.$inferSelect;
export interface Actor {
  userId: string;
  kind: 'merchant' | 'admin';
}

const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const kmToM = (km: number): number => Math.round(km * 1000);

/** Horários, feriados, pausa, entrega, retirada e política de trocas (WB-056..WB-059). Validação de negócio no servidor. */
@Injectable()
export class StoreSettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    private readonly stores: StoresService,
    private readonly params: ParametersService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
  ) {}

  /** Lojista edita configuração salvo se suspensa/recusada (não força visibilidade, O2-APR-16); o admin sempre pode. */
  assertEditable(store: Store, actor: Actor): void {
    if (actor.kind === 'admin') return;
    if (store.status === 'suspended') throw errors.forbidden('STORE_SUSPENDED', 'Loja suspensa. Fale com o suporte.');
    if (store.status === 'rejected') throw errors.conflict('STORE_NOT_EDITABLE', 'Loja recusada. Fale com o suporte.');
  }

  /** Merchant: log da loja (quem, quando, antes/depois); admin: auditoria com antes/depois (WB-104 C3). */
  private async record(tx: DbOrTx, store: Store, actor: Actor, ctx: RequestContext, action: string, before: unknown, after: unknown): Promise<void> {
    if (actor.kind === 'admin') {
      await this.audit.record(tx, ctx, { action: `store.${action}`, targetType: 'store', targetId: store.id, before: before as Record<string, unknown>, after: after as Record<string, unknown> });
    } else {
      await tx.insert(storeActivity).values({ storeId: store.id, actorId: actor.userId, action: `store.${action}`, details: { before, after } as Record<string, unknown> });
    }
  }

  // ------------------------------------------------------------------ leitura

  async weeklyHours(storeId: string, exec: DbOrTx = this.db): Promise<WeeklyHours> {
    const rows = await exec.select().from(storeHours).where(eq(storeHours.storeId, storeId)).orderBy(asc(storeHours.weekday), asc(storeHours.startMin));
    const hours: WeeklyHours = {};
    for (let d = 0; d < 7; d++) hours[d] = [];
    for (const row of rows) hours[row.weekday]!.push({ startMin: row.startMin, endMin: row.endMin });
    return hours;
  }

  async holidays(storeId: string, exec: DbOrTx = this.db): Promise<{ date: string; label: string | null }[]> {
    const rows = await exec.select().from(storeHolidays).where(eq(storeHolidays.storeId, storeId)).orderBy(asc(storeHolidays.day));
    return rows.map((r) => ({ date: r.day, label: r.label }));
  }

  async tiers(storeId: string): Promise<Tier[]> {
    const rows = await this.db.select().from(storeDeliveryTiers).where(eq(storeDeliveryTiers.storeId, storeId)).orderBy(asc(storeDeliveryTiers.position));
    return rows.map((r) => ({ fromM: r.fromM, toM: r.toM, feeCents: r.feeCents }));
  }

  /** "Aberta agora" (RN-03). */
  async isOpenNow(storeId: string, now = new Date()): Promise<boolean> {
    const [settings, hours, holidays] = await Promise.all([this.stores.getSettings(storeId), this.weeklyHours(storeId), this.holidays(storeId)]);
    return isOpenNow({ hours, holidays: new Set(holidays.map((h) => h.date)), pausedUntil: settings.pausedUntil, pausedIndefinitely: settings.pausedIndefinitely }, now);
  }

  async present(store: Store, now = new Date()) {
    const settings = await this.stores.getSettings(store.id);
    const [hours, holidays, tiers, open] = await Promise.all([this.weeklyHours(store.id), this.holidays(store.id), this.tiers(store.id), this.isOpenNow(store.id, now)]);
    const lowDefault = await this.params.getNumber('estoque_baixo_un');
    return {
      isOpenNow: open,
      hours: Object.entries(hours).map(([weekday, intervals]: [string, Interval[]]) => ({ weekday: Number(weekday), intervals: intervals.map((i) => ({ start: toHhmm(i.startMin), end: toHhmm(i.endMin) })) })),
      holidays,
      pause: { active: settings.pausedIndefinitely || (settings.pausedUntil?.getTime() ?? 0) > now.getTime(), until: settings.pausedUntil?.toISOString() ?? null, indefinitely: settings.pausedIndefinitely },
      delivery: {
        acceptsDelivery: settings.acceptsDelivery,
        radiusKm: settings.radiusM / 1000,
        feeMode: settings.feeMode,
        feeFixedCents: settings.feeFixedCents,
        tiers: tiers.map((t) => ({ fromKm: t.fromM / 1000, toKm: t.toM / 1000, feeCents: t.feeCents })),
        minOrderCents: settings.minOrderCents,
        freeAboveCents: settings.freeAboveCents,
        etaMinMinutes: settings.etaMinMinutes,
        etaMaxMinutes: settings.etaMaxMinutes,
      },
      pickup: {
        enabled: settings.pickupEnabled,
        useStoreAddress: settings.pickupUseStoreAddress,
        address: settings.pickupAddress,
        instructions: settings.pickupInstructions,
        prepMinMinutes: settings.pickupPrepMinMinutes,
        prepMaxMinutes: settings.pickupPrepMaxMinutes,
      },
      exchangePolicy: {
        voluntaryDays: settings.voluntaryExchangeDays,
        collectionFeeCents: settings.collectionFeeCents,
        version: settings.exchangePolicyVersion,
        // O piso legal não é configurável por ninguém (DEC-011): só informativo.
        legalFloor: { withdrawalDays: await this.params.getNumber('troca_arrependimento_dias'), defectDays: await this.params.getNumber('troca_defeito_dias') },
      },
      lowStockThreshold: settings.lowStockThreshold ?? lowDefault,
    };
  }

  // ------------------------------------------------------------------ horários

  async setHours(store: Store, days: { weekday: number; intervals: { start: string; end: string }[] }[], actor: Actor, ctx: RequestContext): Promise<void> {
    this.assertEditable(store, actor);
    const fieldErrors: { field: string; message: string }[] = [];
    const rows: { weekday: number; startMin: number; endMin: number }[] = [];
    const seen = new Set<number>();
    days.forEach((day, index) => {
      if (seen.has(day.weekday)) fieldErrors.push({ field: `days[${index}].weekday`, message: 'Dia repetido.' });
      seen.add(day.weekday);
      const intervals: Interval[] = day.intervals.map((i) => ({ startMin: toMin(i.start), endMin: toMin(i.end) }));
      const problem = validateDayIntervals(intervals);
      if (problem) fieldErrors.push({ field: `days[${index}].intervals`, message: problem });
      for (const i of intervals) rows.push({ weekday: day.weekday, ...i });
    });
    if (fieldErrors.length > 0) throw errors.unprocessable('INVALID_HOURS', 'Horários inválidos', { errors: fieldErrors });
    await this.db.transaction(async (tx) => {
      // I5: dois salvamentos simultâneos se enfileiram na linha de configuração (mesmo padrão de setDelivery).
      await tx.select({ id: storeSettings.storeId }).from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
      const before = await this.weeklyHours(store.id, tx);
      await tx.delete(storeHours).where(eq(storeHours.storeId, store.id));
      if (rows.length > 0) await tx.insert(storeHours).values(rows.map((r) => ({ storeId: store.id, ...r })));
      await this.record(tx, store, actor, ctx, 'hours', before, rows);
    });
  }

  async setHolidays(store: Store, holidays: { date: string; label?: string }[], actor: Actor, ctx: RequestContext): Promise<void> {
    this.assertEditable(store, actor);
    if (new Set(holidays.map((h) => h.date)).size !== holidays.length) throw errors.validation([{ field: 'holidays', message: 'Data repetida.' }]);
    await this.db.transaction(async (tx) => {
      await tx.select({ id: storeSettings.storeId }).from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
      const before = await this.holidays(store.id, tx);
      await tx.delete(storeHolidays).where(eq(storeHolidays.storeId, store.id));
      if (holidays.length > 0) await tx.insert(storeHolidays).values(holidays.map((h) => ({ storeId: store.id, day: h.date, label: h.label ?? null })));
      await this.record(tx, store, actor, ctx, 'holidays', before, holidays);
    });
  }

  /** WB-056 C3/C4: a loja vira "Fechada" na hora e reabre sozinha ao fim do prazo (cálculo na leitura, sem job). */
  async pause(store: Store, kind: PauseKind, actor: Actor, ctx: RequestContext, now = new Date()): Promise<void> {
    this.assertEditable(store, actor);
    const next = pauseUntil(kind, now);
    await this.db.transaction(async (tx) => {
      await tx.update(storeSettings).set({ pausedUntil: next.pausedUntil, pausedIndefinitely: next.pausedIndefinitely, updatedAt: now }).where(eq(storeSettings.storeId, store.id));
      await this.record(tx, store, actor, ctx, 'pause', null, { kind, until: next.pausedUntil?.toISOString() ?? null });
    });
  }

  async resume(store: Store, actor: Actor, ctx: RequestContext): Promise<void> {
    this.assertEditable(store, actor);
    await this.db.transaction(async (tx) => {
      await tx.update(storeSettings).set({ pausedUntil: null, pausedIndefinitely: false, updatedAt: new Date() }).where(eq(storeSettings.storeId, store.id));
      await this.record(tx, store, actor, ctx, 'resume', null, null);
    });
  }

  // ------------------------------------------------------------------- entrega

  async setDelivery(store: Store, input: DeliveryInput, actor: Actor, ctx: RequestContext): Promise<void> {
    this.assertEditable(store, actor);
    const settings = await this.stores.getSettings(store.id);
    const maxKm = await this.params.getNumber('raio_max_km');
    const radiusM = kmToM(input.radiusKm);
    const fieldErrors: { field: string; message: string }[] = [];
    if (input.radiusKm < 1 || input.radiusKm > maxKm) fieldErrors.push({ field: 'radiusKm', message: `O raio vai de 1 a ${maxKm} km.` });
    if (input.feeFixedCents > MAX_FIXED_FEE_CENTS) fieldErrors.push({ field: 'feeFixedCents', message: 'A taxa vai de R$ 0,00 a R$ 50,00.' });
    const tiers: Tier[] = input.tiers.map((t) => ({ fromM: kmToM(t.fromKm), toM: kmToM(t.toKm), feeCents: t.feeCents }));
    if (input.feeMode === 'by_distance') {
      const problem = validateTiers(tiers, radiusM);
      if (problem) fieldErrors.push({ field: 'tiers', message: problem });
    }
    const freeProblem = validateFreeAbove(input.freeAboveCents, input.minOrderCents);
    if (freeProblem) fieldErrors.push({ field: 'freeAboveCents', message: freeProblem });
    if (input.etaMinMinutes >= input.etaMaxMinutes) fieldErrors.push({ field: 'etaMaxMinutes', message: 'O tempo máximo precisa ser maior que o mínimo.' });
    // Sempre sobra uma forma de receber pedido: entrega ou retirada (WB-057 C6).
    if (!input.acceptsDelivery && !settings.pickupEnabled) fieldErrors.push({ field: 'acceptsDelivery', message: 'Ative a retirada para desligar a entrega.' });
    if (fieldErrors.length > 0) throw errors.unprocessable('INVALID_DELIVERY', 'Configuração de entrega inválida', { errors: fieldErrors });

    await this.db.transaction(async (tx) => {
      // Trava a linha: duas abas desligando entrega e retirada ao mesmo tempo deixam pelo menos uma ativa.
      const [locked] = await tx.select().from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
      if (!input.acceptsDelivery && !locked?.pickupEnabled) throw errors.unprocessable('INVALID_DELIVERY', 'Configuração de entrega inválida', { errors: [{ field: 'acceptsDelivery', message: 'Ative a retirada para desligar a entrega.' }] });
      await tx
        .update(storeSettings)
        .set({
          acceptsDelivery: input.acceptsDelivery,
          radiusM,
          feeMode: input.feeMode,
          feeFixedCents: input.feeFixedCents,
          minOrderCents: input.minOrderCents,
          freeAboveCents: input.freeAboveCents,
          etaMinMinutes: input.etaMinMinutes,
          etaMaxMinutes: input.etaMaxMinutes,
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.storeId, store.id));
      await tx.delete(storeDeliveryTiers).where(eq(storeDeliveryTiers.storeId, store.id));
      if (input.feeMode === 'by_distance') {
        await tx.insert(storeDeliveryTiers).values(tiers.map((t, position) => ({ storeId: store.id, position, ...t })));
      }
      await this.record(tx, store, actor, ctx, 'delivery', { radiusM: settings.radiusM, feeMode: settings.feeMode, minOrderCents: settings.minOrderCents }, { radiusM, feeMode: input.feeMode, minOrderCents: input.minOrderCents });
    });
  }

  async setPickup(
    store: Store,
    input: { enabled: boolean; useStoreAddress: boolean; address?: string; instructions?: string; prepMinMinutes: number; prepMaxMinutes: number },
    actor: Actor,
    ctx: RequestContext,
  ): Promise<void> {
    this.assertEditable(store, actor);
    if (input.prepMinMinutes >= input.prepMaxMinutes) throw errors.unprocessable('INVALID_PICKUP', 'Tempo de preparo inválido', { errors: [{ field: 'prepMaxMinutes', message: 'O tempo máximo precisa ser maior que o mínimo.' }] });
    if (input.enabled && !(await this.flags.isEnabled('retirada'))) throw errors.conflict('PICKUP_DISABLED', 'Retirada indisponível no momento');
    if (!input.useStoreAddress && !input.address) throw errors.unprocessable('INVALID_PICKUP', 'Informe o endereço de retirada', { errors: [{ field: 'address', message: 'Informe o endereço de retirada.' }] });
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
      if (!input.enabled && !locked?.acceptsDelivery) throw errors.unprocessable('INVALID_PICKUP', 'Configuração inválida', { errors: [{ field: 'enabled', message: 'Ative a entrega para desligar a retirada.' }] });
      await tx
        .update(storeSettings)
        .set({
          pickupEnabled: input.enabled,
          pickupUseStoreAddress: input.useStoreAddress,
          pickupAddress: input.useStoreAddress ? null : (input.address ?? null),
          pickupInstructions: input.instructions ?? null,
          pickupPrepMinMinutes: input.prepMinMinutes,
          pickupPrepMaxMinutes: input.prepMaxMinutes,
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.storeId, store.id));
      await this.record(tx, store, actor, ctx, 'pickup', { enabled: locked?.pickupEnabled }, { enabled: input.enabled });
    });
  }

  /** WB-059: só a troca VOLUNTÁRIA é configurável; arrependimento e defeito são piso legal fixo (DEC-011). */
  async setExchangePolicy(store: Store, input: { voluntaryDays: number; collectionFeeCents: number; confirmDefault?: boolean }, actor: Actor, ctx: RequestContext): Promise<void> {
    this.assertEditable(store, actor);
    const maxFee = await this.params.getNumber('taxa_coleta_max_cents');
    const fieldErrors: { field: string; message: string }[] = [];
    if (input.collectionFeeCents > maxFee) fieldErrors.push({ field: 'collectionFeeCents', message: `A taxa de coleta vai de R$ 0,00 a R$ ${(maxFee / 100).toFixed(2).replace('.', ',')}.` });
    if (input.voluntaryDays !== 0 && input.voluntaryDays < 1) fieldErrors.push({ field: 'voluntaryDays', message: 'O prazo vai de 1 a 30 dias.' });
    if (input.voluntaryDays > 0 && !(await this.flags.isEnabled('trocas_voluntarias'))) fieldErrors.push({ field: 'voluntaryDays', message: 'Trocas voluntárias estão desligadas no momento.' });
    if (fieldErrors.length > 0) throw errors.unprocessable('INVALID_EXCHANGE_POLICY', 'Política de trocas inválida', { errors: fieldErrors });
    await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
      if (!before) throw errors.notFound('Loja não encontrada.');
      const days = input.voluntaryDays === 0 ? 0 : input.voluntaryDays;
      const collection = days === 0 ? 0 : input.collectionFeeCents;
      const changed = before.voluntaryExchangeDays !== days || before.collectionFeeCents !== collection;
      await tx
        .update(storeSettings)
        .set({ voluntaryExchangeDays: days, collectionFeeCents: collection, exchangePolicyVersion: changed ? before.exchangePolicyVersion + 1 : before.exchangePolicyVersion, updatedAt: new Date() })
        .where(eq(storeSettings.storeId, store.id));
      await this.record(tx, store, actor, ctx, 'exchange_policy', { days: before.voluntaryExchangeDays, collection: before.collectionFeeCents }, { days, collection });
    });
  }

  /** Limite de estoque baixo da loja (WB-064): o dela, ou o padrão `estoque_baixo_un`. */
  async lowStockThresholdFor(storeId: string): Promise<number> {
    const settings = await this.stores.getSettings(storeId);
    return settings.lowStockThreshold ?? (await this.params.getNumber('estoque_baixo_un'));
  }

  async setLowStockThreshold(store: Store, threshold: number | null, actor: Actor, ctx: RequestContext): Promise<void> {
    this.assertEditable(store, actor);
    await this.db.transaction(async (tx) => {
      await tx.update(storeSettings).set({ lowStockThreshold: threshold, updatedAt: new Date() }).where(eq(storeSettings.storeId, store.id));
      await this.record(tx, store, actor, ctx, 'low_stock_threshold', null, { threshold });
    });
  }

  /**
   * WB-057 C5: a "prévia" usa a MESMA função do checkout (`quoteDelivery`): distância calculada no banco (PostGIS) e
   * faixa de taxa por `[de, até)`.
   */
  async quoteDelivery(storeId: string, point: { lat: number; lng: number }, subtotalCents: number): Promise<{ available: boolean; distanceM: number | null; feeCents: number | null; freeShipping: boolean; belowMinimum: boolean }> {
    const settings = await this.stores.getSettings(storeId);
    const distanceM = await this.stores.distanceMeters(storeId, point);
    if (!settings.acceptsDelivery || distanceM === null) return { available: false, distanceM, feeCents: null, freeShipping: false, belowMinimum: false };
    const fee = deliveryFee({ mode: settings.feeMode, fixedCents: settings.feeFixedCents, tiers: await this.tiers(storeId), radiusM: settings.radiusM }, Math.round(distanceM));
    if (fee === null) return { available: false, distanceM, feeCents: null, freeShipping: false, belowMinimum: false };
    const final = applyFreeShipping(fee, subtotalCents, settings.freeAboveCents);
    return { available: true, distanceM, feeCents: final, freeShipping: final === 0 && fee > 0, belowMinimum: subtotalCents < settings.minOrderCents };
  }

  async preview(store: Store, input: { cep?: string; lat?: number; lng?: number; subtotalCents: number }) {
    let point = input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null;
    if (!point && input.cep) {
      const looked = await this.geocoding.lookup(input.cep.replace('-', '')).catch(() => null);
      if (looked) point = { lat: looked.lat, lng: looked.lng };
    }
    if (!point) throw errors.unprocessable('PREVIEW_NEEDS_ADDRESS', 'Informe um CEP válido ou a coordenada', { errors: [{ field: 'cep', message: 'Não conseguimos localizar esse endereço.' }] });
    return this.quoteDelivery(store.id, point, input.subtotalCents);
  }
}
