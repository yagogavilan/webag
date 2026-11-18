import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { categories } from '../admin/db/schema.js';
import { ParametersService } from '../admin/index.js';
import { categoryCommissionRates, storeCommissionRates } from './db/schema.js';
import { MAX_COMMISSION_BP, resolveCommission, type CommissionSource, type RateRow } from './domain/commission.js';
import { pctToBp } from './domain/money.js';

export interface ResolvedCommission {
  pctBp: number;
  source: CommissionSource;
}

export interface RateInput {
  /** `null` remove o override (volta à regra seguinte). */
  pctBp: number | null;
  startsAt?: Date;
  endsAt?: Date | null;
  reason: string;
}

/** Resolve a comissão de cada item (loja > categoria > padrão, RN-10) e grava as faixas por loja e categoria (WB-105). */
@Injectable()
export class CommissionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
  ) {}

  async defaultBp(): Promise<number> {
    return pctToBp(await this.params.getNumber('comissao_padrao_pct'));
  }

  /**
   * Um percentual por item, na ordem recebida. `categoryId` nulo usa só loja e padrão. O resultado vira o snapshot do
   * item do pedido: mudança posterior nunca é retroativa (RN-10).
   */
  async resolveForItems(storeId: string, categoryIds: readonly (string | null)[], at = new Date(), exec: DbOrTx = this.db): Promise<ResolvedCommission[]> {
    const [defaultBp, storeRows] = await Promise.all([
      this.defaultBp(),
      exec.select().from(storeCommissionRates).where(eq(storeCommissionRates.storeId, storeId)),
    ]);
    const wanted = [...new Set(categoryIds.filter((id): id is string => id !== null))];
    const chains = new Map<string, string[]>();
    const rates = new Map<string, RateRow[]>();
    if (wanted.length > 0) {
      const own = await exec.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(inArray(categories.id, wanted));
      for (const c of own) chains.set(c.id, c.parentId ? [c.id, c.parentId] : [c.id]);
      const ids = [...new Set([...chains.values()].flat())];
      const rows = await exec.select().from(categoryCommissionRates).where(inArray(categoryCommissionRates.categoryId, ids));
      for (const row of rows) rates.set(row.categoryId, [...(rates.get(row.categoryId) ?? []), row]);
    }
    return categoryIds.map((categoryId) =>
      resolveCommission({
        storeRates: storeRows,
        categoryRates: (categoryId ? (chains.get(categoryId) ?? [categoryId]) : []).map((id) => rates.get(id) ?? []),
        defaultBp,
        at,
      }),
    );
  }

  /** Comissão efetiva hoje da loja e sua origem (WB-105 C5): sem categoria, é a que vale para um item "sem categoria". */
  async effectiveForStore(storeId: string, at = new Date()): Promise<ResolvedCommission> {
    return (await this.resolveForItems(storeId, [null], at))[0]!;
  }

  private validate(input: RateInput): { startsAt: Date; endsAt: Date | null } {
    const fieldErrors: { field: string; message: string }[] = [];
    if (input.pctBp !== null && (!Number.isInteger(input.pctBp) || input.pctBp < 0 || input.pctBp > MAX_COMMISSION_BP)) fieldErrors.push({ field: 'pct', message: 'A comissão vai de 0 a 30%.' });
    if (input.reason.trim().length < 3) fieldErrors.push({ field: 'reason', message: 'Informe o motivo.' });
    const startsAt = input.startsAt ?? new Date();
    const endsAt = input.endsAt ?? null;
    if (endsAt && endsAt <= startsAt) fieldErrors.push({ field: 'endsAt', message: 'O fim da vigência deve ser depois do início.' });
    if (fieldErrors.length > 0) throw errors.validation(fieldErrors);
    return { startsAt, endsAt };
  }

  /** Linha nova (histórico preservado). Quem chama audita na MESMA transação passando `exec`. */
  async setStoreRate(storeId: string, input: RateInput, actorId: string | null, exec: DbOrTx = this.db): Promise<void> {
    const { startsAt, endsAt } = this.validate(input);
    await exec.insert(storeCommissionRates).values({ storeId, pctBp: input.pctBp, startsAt, endsAt, reason: input.reason.trim(), createdBy: actorId });
  }

  async setCategoryRate(categoryId: string, input: RateInput, actorId: string | null, exec: DbOrTx = this.db): Promise<void> {
    const { startsAt, endsAt } = this.validate(input);
    await exec.insert(categoryCommissionRates).values({ categoryId, pctBp: input.pctBp, startsAt, endsAt, reason: input.reason.trim(), createdBy: actorId });
  }

  storeHistory(storeId: string, exec: DbOrTx = this.db) {
    return exec.select().from(storeCommissionRates).where(eq(storeCommissionRates.storeId, storeId)).orderBy(desc(storeCommissionRates.startsAt), desc(storeCommissionRates.createdAt));
  }

  categoryHistory(categoryId: string, exec: DbOrTx = this.db) {
    return exec.select().from(categoryCommissionRates).where(and(eq(categoryCommissionRates.categoryId, categoryId))).orderBy(desc(categoryCommissionRates.startsAt), desc(categoryCommissionRates.createdAt));
  }
}
