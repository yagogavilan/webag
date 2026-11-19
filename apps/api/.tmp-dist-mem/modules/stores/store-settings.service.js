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
import { DeliveryQuoteRegistry } from './delivery-quote.registry.js';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { storeActivity, storeDeliveryTiers, storeHolidays, storeHours, storeSettings } from './db/schema.js';
import { isOpenNow, pauseUntil, validateDayIntervals } from './domain/hours.js';
import { GEOCODING_PROVIDER } from './geocoding.js';
import { StoresService } from './stores.service.js';
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
/** Horários, feriados, pausa, entrega, retirada e política de trocas (WB-056..WB-059). Validação de negócio no servidor. */
let StoreSettingsService = class StoreSettingsService {
    db;
    geocoding;
    stores;
    params;
    flags;
    audit;
    quotes;
    constructor(db, geocoding, stores, params, flags, audit, quotes) {
        this.db = db;
        this.geocoding = geocoding;
        this.stores = stores;
        this.params = params;
        this.flags = flags;
        this.audit = audit;
        this.quotes = quotes;
    }
    /** Lojista edita configuração salvo se suspensa/recusada (não força visibilidade, O2-APR-16); o admin sempre pode. */
    assertEditable(store, actor) {
        if (actor.kind === 'admin')
            return;
        if (store.status === 'suspended')
            throw errors.forbidden('STORE_SUSPENDED', 'Loja suspensa. Fale com o suporte.');
        if (store.status === 'rejected')
            throw errors.conflict('STORE_NOT_EDITABLE', 'Loja recusada. Fale com o suporte.');
    }
    /** Merchant: log da loja (quem, quando, antes/depois); admin: auditoria com antes/depois (WB-104 C3). */
    async record(tx, store, actor, ctx, action, before, after) {
        if (actor.kind === 'admin') {
            await this.audit.record(tx, ctx, { action: `store.${action}`, targetType: 'store', targetId: store.id, before: before, after: after });
        }
        else {
            await tx.insert(storeActivity).values({ storeId: store.id, actorId: actor.userId, action: `store.${action}`, details: { before, after } });
        }
    }
    // ------------------------------------------------------------------ leitura
    async weeklyHours(storeId, exec = this.db) {
        const rows = await exec.select().from(storeHours).where(eq(storeHours.storeId, storeId)).orderBy(asc(storeHours.weekday), asc(storeHours.startMin));
        const hours = {};
        for (let d = 0; d < 7; d++)
            hours[d] = [];
        for (const row of rows)
            hours[row.weekday].push({ startMin: row.startMin, endMin: row.endMin });
        return hours;
    }
    async holidays(storeId, exec = this.db) {
        const rows = await exec.select().from(storeHolidays).where(eq(storeHolidays.storeId, storeId)).orderBy(asc(storeHolidays.day));
        return rows.map((r) => ({ date: r.day, label: r.label }));
    }
    async tiers(storeId) {
        const rows = await this.db.select().from(storeDeliveryTiers).where(eq(storeDeliveryTiers.storeId, storeId)).orderBy(asc(storeDeliveryTiers.position));
        return rows.map((r) => ({ fromM: r.fromM, toM: r.toM, feeCents: r.feeCents }));
    }
    /** "Aberta agora" (RN-03). */
    async isOpenNow(storeId, now = new Date()) {
        const [settings, hours, holidays] = await Promise.all([this.stores.getSettings(storeId), this.weeklyHours(storeId), this.holidays(storeId)]);
        return isOpenNow({ hours, holidays: new Set(holidays.map((h) => h.date)), pausedUntil: settings.pausedUntil, pausedIndefinitely: settings.pausedIndefinitely }, now);
    }
    async present(store, now = new Date()) {
        const settings = await this.stores.getSettings(store.id);
        const [hours, holidays, open] = await Promise.all([this.weeklyHours(store.id), this.holidays(store.id), this.isOpenNow(store.id, now)]);
        const lowDefault = await this.params.getNumber('estoque_baixo_un');
        return {
            isOpenNow: open,
            hours: Object.entries(hours).map(([weekday, intervals]) => ({ weekday: Number(weekday), intervals: intervals.map((i) => ({ start: toHhmm(i.startMin), end: toHhmm(i.endMin) })) })),
            holidays,
            pause: { active: settings.pausedIndefinitely || (settings.pausedUntil?.getTime() ?? 0) > now.getTime(), until: settings.pausedUntil?.toISOString() ?? null, indefinitely: settings.pausedIndefinitely },
            delivery: {
                acceptsDelivery: settings.acceptsDelivery,
                // DEC-036: taxa, raio, mínimo e entrega grátis são do admin; aqui só leitura (campos legados, sempre globais).
                feeManagedBy: 'webag',
                radiusKm: await this.params.getNumber('raio_max_km'),
                feeMode: 'by_distance',
                feeFixedCents: 0,
                tiers: [],
                minOrderCents: await this.params.getNumber('pedido_minimo_cents'),
                freeAboveCents: await this.params.getNumber('frete_gratis_acima_cents'),
                /** @deprecated DEC-053: valores antigos, sem efeito; o ETA é calculado por endereço. */
                etaMinMinutes: settings.etaMinMinutes,
                etaMaxMinutes: settings.etaMaxMinutes,
                /** DEC-053: preparo da loja em uso (o próprio ou o padrão do admin) e se é o padrão. */
                prepMinutes: settings.prepMinutes ?? (await this.params.getNumber('entrega_preparo_padrao_min')),
                prepMinutesIsDefault: settings.prepMinutes === null,
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
                // BUG-017 / WB-059 C2: ao religar a troca voluntária o painel propõe este prazo (`troca_voluntaria_dias_padrao`) para a loja confirmar.
                defaultVoluntaryDays: await this.params.getNumber('troca_voluntaria_dias_padrao'),
                legalFloor: { withdrawalDays: await this.params.getNumber('troca_arrependimento_dias'), defectDays: await this.params.getNumber('troca_defeito_dias'), defectDurableDays: await this.params.getNumber('troca_defeito_duravel_dias') },
            },
            lowStockThreshold: settings.lowStockThreshold ?? lowDefault,
        };
    }
    // ------------------------------------------------------------------ horários
    async setHours(store, days, actor, ctx) {
        this.assertEditable(store, actor);
        const fieldErrors = [];
        const rows = [];
        const seen = new Set();
        days.forEach((day, index) => {
            if (seen.has(day.weekday))
                fieldErrors.push({ field: `days[${index}].weekday`, message: 'Dia repetido.' });
            seen.add(day.weekday);
            const intervals = day.intervals.map((i) => ({ startMin: toMin(i.start), endMin: toMin(i.end) }));
            const problem = validateDayIntervals(intervals);
            if (problem)
                fieldErrors.push({ field: `days[${index}].intervals`, message: problem });
            for (const i of intervals)
                rows.push({ weekday: day.weekday, ...i });
        });
        if (fieldErrors.length > 0)
            throw errors.unprocessable('INVALID_HOURS', 'Horários inválidos', { errors: fieldErrors });
        await this.db.transaction(async (tx) => {
            // I5: dois salvamentos simultâneos se enfileiram na linha de configuração (mesmo padrão de setDelivery).
            await tx.select({ id: storeSettings.storeId }).from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
            const before = await this.weeklyHours(store.id, tx);
            await tx.delete(storeHours).where(eq(storeHours.storeId, store.id));
            if (rows.length > 0)
                await tx.insert(storeHours).values(rows.map((r) => ({ storeId: store.id, ...r })));
            await this.record(tx, store, actor, ctx, 'hours', before, rows);
        });
    }
    async setHolidays(store, holidays, actor, ctx) {
        this.assertEditable(store, actor);
        if (new Set(holidays.map((h) => h.date)).size !== holidays.length)
            throw errors.validation([{ field: 'holidays', message: 'Data repetida.' }]);
        await this.db.transaction(async (tx) => {
            await tx.select({ id: storeSettings.storeId }).from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
            const before = await this.holidays(store.id, tx);
            await tx.delete(storeHolidays).where(eq(storeHolidays.storeId, store.id));
            if (holidays.length > 0)
                await tx.insert(storeHolidays).values(holidays.map((h) => ({ storeId: store.id, day: h.date, label: h.label ?? null })));
            await this.record(tx, store, actor, ctx, 'holidays', before, holidays);
        });
    }
    /** WB-056 C3/C4: a loja vira "Fechada" na hora e reabre sozinha ao fim do prazo (cálculo na leitura, sem job). */
    async pause(store, kind, actor, ctx, now = new Date()) {
        this.assertEditable(store, actor);
        const next = pauseUntil(kind, now);
        await this.db.transaction(async (tx) => {
            await tx.update(storeSettings).set({ pausedUntil: next.pausedUntil, pausedIndefinitely: next.pausedIndefinitely, updatedAt: now }).where(eq(storeSettings.storeId, store.id));
            await this.record(tx, store, actor, ctx, 'pause', null, { kind, until: next.pausedUntil?.toISOString() ?? null });
        });
    }
    async resume(store, actor, ctx) {
        this.assertEditable(store, actor);
        await this.db.transaction(async (tx) => {
            await tx.update(storeSettings).set({ pausedUntil: null, pausedIndefinitely: false, updatedAt: new Date() }).where(eq(storeSettings.storeId, store.id));
            await this.record(tx, store, actor, ctx, 'resume', null, null);
        });
    }
    // ------------------------------------------------------------------- entrega
    /**
     * DEC-036: o lojista escolhe só "entrega pela Webag" e/ou "retirada" e o tempo de preparo; taxa, faixas, raio, mínimo e
     * entrega grátis são do admin (campos antigos são aceitos e ignorados, para o app publicado não quebrar).
     */
    async setDelivery(store, input, actor, ctx) {
        this.assertEditable(store, actor);
        const settings = await this.stores.getSettings(store.id);
        const fieldErrors = [];
        if (input.prepMinutes != null) {
            // Preparo que sozinho estoura o teto de entrega deixaria a loja sem nenhum endereço alcançável (DEC-053).
            // DEC-054: o teto vale para o FIM da faixa (estimativa + folga).
            const [maxMin, dispatchMin, bandMin] = await Promise.all([this.params.getNumber('entrega_max_min'), this.params.getNumber('entrega_despacho_min'), this.params.getNumber('entrega_faixa_min')]);
            const room = maxMin - dispatchMin - bandMin;
            if (input.prepMinutes >= room)
                fieldErrors.push({ field: 'prepMinutes', message: `O preparo precisa ser menor que ${room} min para a loja entregar em até ${maxMin} min.` });
        }
        // Sempre sobra uma forma de receber pedido: entrega ou retirada (WB-057 C6).
        if (!input.acceptsDelivery && !settings.pickupEnabled)
            fieldErrors.push({ field: 'acceptsDelivery', message: 'Ative a retirada para desligar a entrega.' });
        if (fieldErrors.length > 0)
            throw errors.unprocessable('INVALID_DELIVERY', 'Configuração de entrega inválida', { errors: fieldErrors });
        await this.db.transaction(async (tx) => {
            // Trava a linha: duas abas desligando entrega e retirada ao mesmo tempo deixam pelo menos uma ativa.
            const [locked] = await tx.select().from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
            if (!input.acceptsDelivery && !locked?.pickupEnabled)
                throw errors.unprocessable('INVALID_DELIVERY', 'Configuração de entrega inválida', { errors: [{ field: 'acceptsDelivery', message: 'Ative a retirada para desligar a entrega.' }] });
            await tx.update(storeSettings).set({ acceptsDelivery: input.acceptsDelivery, ...(input.prepMinutes !== undefined ? { prepMinutes: input.prepMinutes } : {}), updatedAt: new Date() }).where(eq(storeSettings.storeId, store.id));
            await this.record(tx, store, actor, ctx, 'delivery', { acceptsDelivery: settings.acceptsDelivery, prepMinutes: settings.prepMinutes }, { acceptsDelivery: input.acceptsDelivery, prepMinutes: input.prepMinutes === undefined ? settings.prepMinutes : input.prepMinutes });
        });
    }
    async setPickup(store, input, actor, ctx) {
        this.assertEditable(store, actor);
        if (input.prepMinMinutes >= input.prepMaxMinutes)
            throw errors.unprocessable('INVALID_PICKUP', 'Tempo de preparo inválido', { errors: [{ field: 'prepMaxMinutes', message: 'O tempo máximo precisa ser maior que o mínimo.' }] });
        if (input.enabled && !(await this.flags.isEnabled('retirada')))
            throw errors.conflict('PICKUP_DISABLED', 'Retirada indisponível no momento');
        if (!input.useStoreAddress && !input.address)
            throw errors.unprocessable('INVALID_PICKUP', 'Informe o endereço de retirada', { errors: [{ field: 'address', message: 'Informe o endereço de retirada.' }] });
        await this.db.transaction(async (tx) => {
            const [locked] = await tx.select().from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
            if (!input.enabled && !locked?.acceptsDelivery)
                throw errors.unprocessable('INVALID_PICKUP', 'Configuração inválida', { errors: [{ field: 'enabled', message: 'Ative a entrega para desligar a retirada.' }] });
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
    async setExchangePolicy(store, input, actor, ctx) {
        this.assertEditable(store, actor);
        // DEC-037: o prazo da troca por tamanho/cor é da loja DENTRO do mínimo e máximo do admin; a taxa de coleta é da tabela do
        // admin por região (a loja não define): o campo antigo é aceito e ignorado.
        const [minDays, maxDays] = await Promise.all([this.params.getNumber('troca_voluntaria_dias_min'), this.params.getNumber('troca_voluntaria_dias_max')]);
        const fieldErrors = [];
        if (input.voluntaryDays !== 0 && (input.voluntaryDays < minDays || input.voluntaryDays > maxDays))
            fieldErrors.push({ field: 'voluntaryDays', message: `O prazo vai de ${minDays} a ${maxDays} dias (ou 0 para não aceitar).` });
        if (input.voluntaryDays > 0 && !(await this.flags.isEnabled('trocas_voluntarias')))
            fieldErrors.push({ field: 'voluntaryDays', message: 'Trocas voluntárias estão desligadas no momento.' });
        if (fieldErrors.length > 0)
            throw errors.unprocessable('INVALID_EXCHANGE_POLICY', 'Política de trocas inválida', { errors: fieldErrors });
        await this.db.transaction(async (tx) => {
            const [before] = await tx.select().from(storeSettings).where(eq(storeSettings.storeId, store.id)).for('update');
            if (!before)
                throw errors.notFound('Loja não encontrada.');
            const days = input.voluntaryDays === 0 ? 0 : input.voluntaryDays;
            const collection = 0; // taxa de coleta é da tabela do admin (DEC-037)
            const changed = before.voluntaryExchangeDays !== days || before.collectionFeeCents !== collection;
            await tx
                .update(storeSettings)
                .set({ voluntaryExchangeDays: days, collectionFeeCents: collection, exchangePolicyVersion: changed ? before.exchangePolicyVersion + 1 : before.exchangePolicyVersion, updatedAt: new Date() })
                .where(eq(storeSettings.storeId, store.id));
            await this.record(tx, store, actor, ctx, 'exchange_policy', { days: before.voluntaryExchangeDays, collection: before.collectionFeeCents }, { days, collection });
        });
    }
    /** Limite de estoque baixo da loja (WB-064): o dela, ou o padrão `estoque_baixo_un`. */
    async lowStockThresholdFor(storeId) {
        const settings = await this.stores.getSettings(storeId);
        return settings.lowStockThreshold ?? (await this.params.getNumber('estoque_baixo_un'));
    }
    async setLowStockThreshold(store, threshold, actor, ctx) {
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
    async quoteDelivery(storeId, point, subtotalCents) {
        const [settings, quote] = await Promise.all([this.stores.getSettings(storeId), this.quotes.quote(storeId, point, subtotalCents)]);
        return settings.acceptsDelivery ? quote : { ...quote, available: false, feeCents: null, freeShipping: false };
    }
    async preview(store, input) {
        let point = input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null;
        if (!point && input.cep) {
            const looked = await this.geocoding.lookup(input.cep.replace('-', '')).catch(() => null);
            if (looked && looked.lat !== null && looked.lng !== null)
                point = { lat: looked.lat, lng: looked.lng };
        }
        if (!point)
            throw errors.unprocessable('PREVIEW_NEEDS_ADDRESS', 'Informe um CEP válido ou a coordenada', { errors: [{ field: 'cep', message: 'Não conseguimos localizar esse endereço.' }] });
        return this.quoteDelivery(store.id, point, input.subtotalCents);
    }
};
StoreSettingsService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __param(1, Inject(GEOCODING_PROVIDER)),
    __metadata("design:paramtypes", [Object, Object, StoresService,
        ParametersService,
        FeatureFlagsService,
        AuditService,
        DeliveryQuoteRegistry])
], StoreSettingsService);
export { StoreSettingsService };
//# sourceMappingURL=store-settings.service.js.map