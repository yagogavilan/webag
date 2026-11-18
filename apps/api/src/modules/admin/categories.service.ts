import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { CATEGORY_ICONS } from './categories.icons.js';
import { categories } from './db/schema.js';
import { isUniqueViolation } from './util.js';

export type Category = typeof categories.$inferSelect;
export type CategoryNode = Category & { children: Category[] };

const taken = () => errors.conflict('CATEGORY_NAME_TAKEN', 'Já existe uma categoria com esse nome neste nível');

/** WB-106: 2 níveis (categoria e subcategoria). */
@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** Árvore. Para o app (`onlyActive`): categoria inativa some junto com as subcategorias (WB-106 C3). */
  async tree(onlyActive = false): Promise<CategoryNode[]> {
    const rows = await this.db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
    const visible = rows.filter((row) => !onlyActive || row.active);
    return visible
      .filter((row) => row.parentId === null)
      .map((root) => ({ ...root, children: visible.filter((row) => row.parentId === root.id) }));
  }

  async create(
    input: { name: string; icon: string; parentId: string | null; position: number; active: boolean },
    ctx: RequestContext,
  ): Promise<Category> {
    this.assertIcon(input.icon);
    try {
      return await this.db.transaction(async (tx) => {
        if (input.parentId) {
          const [parent] = await tx.select().from(categories).where(eq(categories.id, input.parentId));
          if (!parent) throw errors.notFound('Categoria pai não encontrada.');
          if (parent.parentId !== null) {
            throw errors.unprocessable('CATEGORY_DEPTH_EXCEEDED', 'Só há dois níveis', { detail: 'Subcategoria não pode ter filhas.' });
          }
        }
        const [created] = await tx.insert(categories).values(input).returning();
        if (!created) throw new Error('Falha ao criar categoria');
        await this.audit.record(tx, ctx, { action: 'category.create', targetType: 'category', targetId: created.id, after: { ...created } });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken();
      throw error;
    }
  }

  async update(
    id: string,
    patch: { name?: string; icon?: string; position?: number; active?: boolean },
    ctx: RequestContext,
  ): Promise<Category> {
    if (patch.icon) this.assertIcon(patch.icon);
    try {
      return await this.db.transaction(async (tx) => {
        const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for('update');
        if (!before) throw errors.notFound('Categoria não encontrada.');
        const [after] = await tx.update(categories).set({ ...patch, updatedAt: new Date() }).where(eq(categories.id, id)).returning();
        if (!after) throw new Error('Falha ao atualizar categoria');
        await this.audit.record(tx, ctx, { action: 'category.update', targetType: 'category', targetId: id, before: { ...before }, after: { ...after } });
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken();
      throw error;
    }
  }

  /** WB-106 C2: define a ordem dos irmãos (mesmo pai) pela ordem da lista. */
  async reorder(ids: string[], ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = await tx.select().from(categories).where(inArray(categories.id, ids)).for('update');
      if (rows.length !== ids.length) throw errors.notFound('Categoria não encontrada.');
      if (new Set(rows.map((row) => row.parentId)).size > 1) {
        throw errors.unprocessable('CATEGORY_REORDER_MIXED', 'Reordene apenas categorias do mesmo nível');
      }
      for (const [position, id] of ids.entries()) {
        await tx.update(categories).set({ position, updatedAt: new Date() }).where(eq(categories.id, id));
      }
      await this.audit.record(tx, ctx, { action: 'category.reorder', targetType: 'category', after: { ids } });
    });
  }

  /**
   * WB-106 C4: exclui só sem vínculos. Subcategorias contam hoje; produtos e lojas entram quando os módulos
   * `catalog` e `stores` existirem (Onda 2) estendendo `countLinks`.
   */
  async remove(id: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for('update');
      if (!before) throw errors.notFound('Categoria não encontrada.');
      const children = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, id)));
      if (children.length > 0) {
        throw errors.conflict('CATEGORY_IN_USE', 'Categoria em uso', 'Mova antes ou inative.');
      }
      await tx.delete(categories).where(eq(categories.id, id));
      await this.audit.record(tx, ctx, { action: 'category.delete', targetType: 'category', targetId: id, before: { ...before } });
    });
  }

  /** Seed idempotente por (pai, nome). */
  async ensure(name: string, icon: string, position: number, parentId: string | null = null): Promise<string> {
    const [existing] = await this.db
      .select()
      .from(categories)
      .where(and(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId), eq(categories.name, name)));
    if (existing) return existing.id;
    const [created] = await this.db.insert(categories).values({ name, icon, position, parentId }).returning();
    if (!created) throw new Error('Falha no seed de categorias');
    return created.id;
  }

  private assertIcon(icon: string): void {
    if (!(CATEGORY_ICONS as readonly string[]).includes(icon)) {
      throw errors.unprocessable('CATEGORY_ICON_INVALID', 'Ícone inválido', { errors: [{ field: 'icon', message: 'Use um ícone da biblioteca.' }] });
    }
  }
}
