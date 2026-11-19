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
import { desc, eq, notInArray, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { searchHistory } from './db/schema.js';
export const HISTORY_SIZE = 10;
/** Chave de comparação: sem acento, minúscula e espaços colapsados ("Tênis  Azul" == "tenis azul"). */
export const termKey = (term) => term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
/** Histórico de buscas da conta (WB-015): últimos 10 termos distintos; "limpar" apaga tudo da conta (LGPD). */
let SearchHistoryService = class SearchHistoryService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(userId) {
        const rows = await this.db.select().from(searchHistory).where(eq(searchHistory.userId, userId)).orderBy(desc(searchHistory.searchedAt)).limit(HISTORY_SIZE);
        return rows.map((row) => ({ term: row.term, searchedAt: row.searchedAt.toISOString() }));
    }
    /** Repetir um termo só o traz de volta ao topo; o 11º mais antigo é descartado. */
    async record(userId, term) {
        const key = termKey(term);
        await this.db.transaction(async (tx) => {
            await tx
                .insert(searchHistory)
                .values({ userId, termKey: key, term: term.trim().replace(/\s+/g, ' ').slice(0, 80) })
                .onConflictDoUpdate({ target: [searchHistory.userId, searchHistory.termKey], set: { term: sql `excluded.term`, searchedAt: sql `now()` } });
            const keep = await tx.select({ key: searchHistory.termKey }).from(searchHistory).where(eq(searchHistory.userId, userId)).orderBy(desc(searchHistory.searchedAt)).limit(HISTORY_SIZE);
            await tx.delete(searchHistory).where(and(eq(searchHistory.userId, userId), notInArray(searchHistory.termKey, keep.map((k) => k.key))));
        });
    }
    async clear(userId) {
        await this.db.delete(searchHistory).where(eq(searchHistory.userId, userId));
    }
};
SearchHistoryService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], SearchHistoryService);
export { SearchHistoryService };
//# sourceMappingURL=search-history.service.js.map