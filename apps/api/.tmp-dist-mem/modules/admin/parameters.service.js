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
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { maxDistanceForCeilingM } from '../logistics/domain/eta.js';
import { AuditService } from './audit.service.js';
import { parameterHistory, parameters } from './db/schema.js';
import { PARAMETER_BY_KEY, PARAMETER_DEFINITIONS, validateParameterValue, } from './parameters.definitions.js';
const CACHE_TTL_MS = 10_000;
let ParametersService = class ParametersService {
    db;
    audit;
    cache = null;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    async values() {
        if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS)
            return this.cache.values;
        const rows = await this.db.select().from(parameters);
        const values = new Map(rows.map((row) => [row.key, row.value]));
        this.cache = { at: Date.now(), values };
        return values;
    }
    /** Valor vigente (ou o padrão, se ainda não houver linha). Muda para todos em até 10 s entre instâncias. */
    async get(key) {
        const definition = PARAMETER_BY_KEY.get(key);
        if (!definition)
            throw new Error(`Parâmetro desconhecido: ${key}`);
        return (await this.values()).get(key) ?? definition.default;
    }
    async getNumber(key) {
        return Number(await this.get(key));
    }
    async list() {
        const rows = await this.db.select().from(parameters);
        const byKey = new Map(rows.map((row) => [row.key, row]));
        return PARAMETER_DEFINITIONS.map((definition) => {
            const row = byKey.get(definition.key);
            return {
                key: definition.key,
                value: row?.value ?? definition.default,
                default: definition.default,
                type: definition.type,
                min: 'min' in definition ? (definition.min ?? null) : null,
                max: 'max' in definition ? (definition.max ?? null) : null,
                values: definition.type === 'enum' ? definition.values : null,
                description: definition.description,
                ref: definition.ref,
                legalFloor: definition.legalFloor === true,
                updatedAt: row?.updatedAt.toISOString() ?? null,
            };
        });
    }
    /** WB-119 C2/C3: valida faixa, exige motivo, grava histórico e auditoria na mesma transação. */
    async update(key, value, reason, ctx, expectedUpdatedAt) {
        const definition = PARAMETER_BY_KEY.get(key);
        if (!definition)
            throw errors.notFound('Parâmetro não encontrado.');
        if (definition.legalFloor)
            throw errors.unprocessable('PARAMETER_LOCKED', 'Parâmetro fixo por lei', { detail: 'Piso legal de troca não é editável (DEC-011).' });
        const problem = validateParameterValue(definition, value);
        if (problem)
            throw errors.unprocessable('PARAMETER_OUT_OF_RANGE', 'Valor fora da faixa', { detail: problem, errors: [{ field: 'value', message: problem }] });
        await this.assertFreeShippingRule(key, value);
        await this.assertEtaRules(key, value);
        await this.write(definition, value, reason, ctx, 'parameter.update', expectedUpdatedAt);
        return this.view(key);
    }
    /** RN-04 / R-17c: entrega grátis acima de X precisa ser estritamente maior que o pedido mínimo (0 desliga o grátis). */
    async assertFreeShippingRule(key, value) {
        if (key !== 'pedido_minimo_cents' && key !== 'frete_gratis_acima_cents')
            return;
        const min = key === 'pedido_minimo_cents' ? value : await this.getNumber('pedido_minimo_cents');
        const freeAbove = key === 'frete_gratis_acima_cents' ? value : await this.getNumber('frete_gratis_acima_cents');
        if (freeAbove !== 0 && freeAbove <= min) {
            const detail = 'O valor para entrega grátis precisa ser maior que o pedido mínimo (ou 0 para desligar).';
            throw errors.unprocessable('PARAMETER_OUT_OF_RANGE', 'Valor fora da faixa', { detail, errors: [{ field: 'value', message: detail }] });
        }
    }
    /**
     * RN-02 / BUG-022: validação cruzada dos parâmetros do ETA (DEC-053/054). Valor que zera o alcance da entrega da plataforma inteira é
     * recusado (422), com a prévia de alcance em km do que o valor proposto faria. `entrega_max_min` - `entrega_faixa_min` precisa ser
     * >= preparo padrão + despacho + 5 min (senão nenhuma loja alcança ninguém) e `entrega_faixa_min` <= `entrega_max_min` / 4.
     */
    async assertEtaRules(key, value) {
        const keys = ['entrega_max_min', 'entrega_faixa_min', 'entrega_preparo_padrao_min', 'entrega_despacho_min'];
        if (!keys.includes(key))
            return;
        const next = async (k) => (k === key ? value : this.getNumber(k));
        const [max, band, prep, dispatch, factor, perKm] = await Promise.all([next('entrega_max_min'), next('entrega_faixa_min'), next('entrega_preparo_padrao_min'), next('entrega_despacho_min'), this.getNumber('entrega_rota_fator_pct'), this.getNumber('entrega_min_por_km')]);
        const reachKm = maxDistanceForCeilingM({ defaultPrepMin: prep, dispatchMin: dispatch, routeFactorPct: factor, minPerKm: perKm, bandMin: band, maxMin: max }, prep) / 1000;
        const preview = `Com estes valores a entrega alcança até ${reachKm.toFixed(1).replace('.', ',')} km da loja.`;
        const fail = (detail) => {
            throw errors.unprocessable('PARAMETER_OUT_OF_RANGE', 'Valor fora da faixa', { detail: `${detail} ${preview}`, errors: [{ field: 'value', message: detail }], extensions: { reachKm } });
        };
        if (max - band < prep + dispatch + 5) {
            fail(`O teto (${max} min) menos a folga (${band} min) precisa cobrir preparo (${prep}) + despacho (${dispatch}) + 5 min, ou seja, teto de pelo menos ${prep + dispatch + 5 + band} min; senão nenhuma loja alcança ninguém.`);
        }
        if (band > max / 4)
            fail(`A folga (${band} min) não pode passar de um quarto do teto (${max} min).`);
    }
    /** WB-119 C4: volta ao padrão de seed. */
    async reset(key, reason, ctx, expectedUpdatedAt) {
        const definition = PARAMETER_BY_KEY.get(key);
        if (!definition)
            throw errors.notFound('Parâmetro não encontrado.');
        if (definition.legalFloor)
            throw errors.unprocessable('PARAMETER_LOCKED', 'Parâmetro fixo por lei', { detail: 'Piso legal de troca não é editável (DEC-011).' });
        await this.assertEtaRules(key, definition.default);
        await this.write(definition, definition.default, reason, ctx, 'parameter.reset', expectedUpdatedAt);
        return this.view(key);
    }
    /** Seed idempotente: cria só o que falta, nunca sobrescreve valor editado pelo admin. */
    async ensureDefaults() {
        await this.db
            .insert(parameters)
            .values(PARAMETER_DEFINITIONS.map((definition) => ({ key: definition.key, value: definition.default })))
            .onConflictDoNothing();
    }
    async write(definition, value, reason, ctx, action, expectedUpdatedAt) {
        await this.db.transaction(async (tx) => {
            const [current] = await tx.select().from(parameters).where(eq(parameters.key, definition.key)).for('update');
            // RN-02: edição concorrente. `undefined` = cliente sem controle de versão; `null` = "nunca foi editado".
            if (expectedUpdatedAt !== undefined) {
                const currentVersion = current?.updatedAt?.getTime() ?? null;
                const expectedVersion = expectedUpdatedAt === null ? null : new Date(expectedUpdatedAt).getTime();
                if (currentVersion !== expectedVersion) {
                    throw errors.conflict('PARAMETER_CONFLICT', 'Parâmetro alterado por outra pessoa', 'Outro admin alterou este parâmetro. Recarregue para ver o valor atual.');
                }
            }
            const before = current?.value ?? definition.default;
            await tx
                .insert(parameters)
                .values({ key: definition.key, value, updatedBy: ctx.principal?.userId ?? null })
                .onConflictDoUpdate({
                target: parameters.key,
                set: { value, updatedAt: new Date(), updatedBy: ctx.principal?.userId ?? null },
            });
            await tx.insert(parameterHistory).values({
                key: definition.key,
                oldValue: before,
                newValue: value,
                reason,
                changedBy: ctx.principal?.userId ?? null,
            });
            await this.audit.record(tx, ctx, {
                action,
                targetType: 'parameter',
                targetId: definition.key,
                before: { value: before },
                after: { value },
                reason,
            });
        });
        this.cache = null;
    }
    async view(key) {
        const found = (await this.list()).find((item) => item.key === key);
        if (!found)
            throw errors.notFound();
        return found;
    }
};
ParametersService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuditService])
], ParametersService);
export { ParametersService };
//# sourceMappingURL=parameters.service.js.map