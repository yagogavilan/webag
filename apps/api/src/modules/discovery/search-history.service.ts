import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, notInArray, and, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { searchHistory } from './db/schema.js';

export const HISTORY_SIZE = 10;

/** Chave de comparação: sem acento, minúscula e espaços colapsados ("Tênis  Azul" == "tenis azul"). */
export const termKey = (term: string): string =>
  term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

/** Histórico de buscas da conta (WB-015): últimos 10 termos distintos; "limpar" apaga tudo da conta (LGPD). */
@Injectable()
export class SearchHistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async list(userId: string) {
    const rows = await this.db.select().from(searchHistory).where(eq(searchHistory.userId, userId)).orderBy(desc(searchHistory.searchedAt)).limit(HISTORY_SIZE);
    return rows.map((row) => ({ term: row.term, searchedAt: row.searchedAt.toISOString() }));
  }

  /** Repetir um termo só o traz de volta ao topo; o 11º mais antigo é descartado. */
  async record(userId: string, term: string): Promise<void> {
    const key = termKey(term);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(searchHistory)
        .values({ userId, termKey: key, term: term.trim().replace(/\s+/g, ' ').slice(0, 80) })
        .onConflictDoUpdate({ target: [searchHistory.userId, searchHistory.termKey], set: { term: sql`excluded.term`, searchedAt: sql`now()` } });
      const keep = await tx.select({ key: searchHistory.termKey }).from(searchHistory).where(eq(searchHistory.userId, userId)).orderBy(desc(searchHistory.searchedAt)).limit(HISTORY_SIZE);
      await tx.delete(searchHistory).where(and(eq(searchHistory.userId, userId), notInArray(searchHistory.termKey, keep.map((k) => k.key))));
    });
  }

  async clear(userId: string): Promise<void> {
    await this.db.delete(searchHistory).where(eq(searchHistory.userId, userId));
  }
}
