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
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { categories } from '../admin/db/schema.js';
import { ParametersService } from '../admin/index.js';
import { categoryCommissionRates, storeCommissionRates } from './db/schema.js';
import { currentRate, MAX_COMMISSION_BP, resolveCommission } from './domain/commission.js';
import { pctToBp } from './domain/money.js';
/** Resolve a comissão de cada item (loja > categoria > padrão, RN-10) e grava as faixas por loja e categoria (WB-105). */
let CommissionService = class CommissionService {
    db;
    params;
    constructor(db, params) {
        this.db = db;
        this.params = params;
    }
    async defaultBp() {
        return pctToBp(await this.params.getNumber('comissao_padrao_pct'));
    }
    /**
     * Um percentual por item, na ordem recebida. `categoryId` nulo usa só loja e padrão. O resultado vira o snapshot do
     * item do pedido: mudança posterior nunca é retroativa (RN-10).
     */
    async resolveForItems(storeId, categoryIds, at = new Date(), exec = this.db) {
        const [defaultBp, storeRows] = await Promise.all([
            this.defaultBp(),
            exec.select().from(storeCommissionRates).where(eq(storeCommissionRates.storeId, storeId)),
        ]);
        const wanted = [...new Set(categoryIds.filter((id) => id !== null))];
        const chains = new Map();
        const rates = new Map();
        if (wanted.length > 0) {
            const own = await exec.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(inArray(categories.id, wanted));
            for (const c of own)
                chains.set(c.id, c.parentId ? [c.id, c.parentId] : [c.id]);
            const ids = [...new Set([...chains.values()].flat())];
            const rows = await exec.select().from(categoryCommissionRates).where(inArray(categoryCommissionRates.categoryId, ids));
            for (const row of rows)
                rates.set(row.categoryId, [...(rates.get(row.categoryId) ?? []), row]);
        }
        return categoryIds.map((categoryId) => resolveCommission({
            storeRates: storeRows,
            categoryRates: (categoryId ? (chains.get(categoryId) ?? [categoryId]) : []).map((id) => rates.get(id) ?? []),
            defaultBp,
            at,
        }));
    }
    /** Comissão efetiva hoje da loja e sua origem (WB-105 C5): sem categoria, é a que vale para um item "sem categoria". */
    async effectiveForStore(storeId, at = new Date()) {
        return (await this.resolveForItems(storeId, [null], at))[0];
    }
    /**
     * "Você recebe" do lojista: comissão efetiva da loja (loja > categoria > padrão) e, quando não há taxa própria da loja, as
     * categorias com taxa em vigor (o filho herda a da mãe; quem monta a conta sabe a árvore de categorias). Percentuais em %.
     */
    async viewForStore(storeId, at = new Date()) {
        const effective = await this.effectiveForStore(storeId, at);
        if (effective.source === 'store')
            return { pct: effective.pctBp / 100, source: 'store', categories: [] };
        const rows = await this.db.select().from(categoryCommissionRates);
        const byCategory = new Map();
        for (const row of rows)
            byCategory.set(row.categoryId, [...(byCategory.get(row.categoryId) ?? []), row]);
        const categoriesWithRate = [];
        for (const [categoryId, list] of byCategory) {
            const rate = currentRate(list, at);
            if (rate && rate.pctBp !== null)
                categoriesWithRate.push({ categoryId, pct: rate.pctBp / 100 });
        }
        return { pct: (await this.defaultBp()) / 100, source: 'default', categories: categoriesWithRate };
    }
    validate(input) {
        const fieldErrors = [];
        if (input.pctBp !== null && (!Number.isInteger(input.pctBp) || input.pctBp < 0 || input.pctBp > MAX_COMMISSION_BP))
            fieldErrors.push({ field: 'pct', message: 'A comissão vai de 0 a 30%.' });
        if (input.reason.trim().length < 3)
            fieldErrors.push({ field: 'reason', message: 'Informe o motivo.' });
        const startsAt = input.startsAt ?? new Date();
        const endsAt = input.endsAt ?? null;
        if (endsAt && endsAt <= startsAt)
            fieldErrors.push({ field: 'endsAt', message: 'O fim da vigência deve ser depois do início.' });
        if (fieldErrors.length > 0)
            throw errors.validation(fieldErrors);
        return { startsAt, endsAt };
    }
    /** Linha nova (histórico preservado). Quem chama audita na MESMA transação passando `exec`. */
    async setStoreRate(storeId, input, actorId, exec = this.db) {
        const { startsAt, endsAt } = this.validate(input);
        await exec.insert(storeCommissionRates).values({ storeId, pctBp: input.pctBp, startsAt, endsAt, reason: input.reason.trim(), createdBy: actorId });
    }
    async setCategoryRate(categoryId, input, actorId, exec = this.db) {
        const { startsAt, endsAt } = this.validate(input);
        await exec.insert(categoryCommissionRates).values({ categoryId, pctBp: input.pctBp, startsAt, endsAt, reason: input.reason.trim(), createdBy: actorId });
    }
    storeHistory(storeId, exec = this.db) {
        return exec.select().from(storeCommissionRates).where(eq(storeCommissionRates.storeId, storeId)).orderBy(desc(storeCommissionRates.startsAt), desc(storeCommissionRates.createdAt));
    }
    categoryHistory(categoryId, exec = this.db) {
        return exec.select().from(categoryCommissionRates).where(and(eq(categoryCommissionRates.categoryId, categoryId))).orderBy(desc(categoryCommissionRates.startsAt), desc(categoryCommissionRates.createdAt));
    }
};
CommissionService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, ParametersService])
], CommissionService);
export { CommissionService };
//# sourceMappingURL=commission.service.js.map