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
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { CATEGORY_ICONS } from './categories.icons.js';
import { categories } from './db/schema.js';
import { isUniqueViolation } from './util.js';
const taken = () => errors.conflict('CATEGORY_NAME_TAKEN', 'Já existe uma categoria com esse nome neste nível');
/** WB-106: 2 níveis (categoria e subcategoria). */
let CategoriesService = class CategoriesService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    /** Árvore. Para o app (`onlyActive`): categoria inativa some junto com as subcategorias (WB-106 C3). */
    async tree(onlyActive = false) {
        const rows = await this.db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
        const visible = rows.filter((row) => !onlyActive || row.active);
        return visible
            .filter((row) => row.parentId === null)
            .map((root) => ({ ...root, children: visible.filter((row) => row.parentId === root.id) }));
    }
    async create(input, ctx) {
        this.assertIcon(input.icon);
        try {
            return await this.db.transaction(async (tx) => {
                if (input.parentId) {
                    const [parent] = await tx.select().from(categories).where(eq(categories.id, input.parentId));
                    if (!parent)
                        throw errors.notFound('Categoria pai não encontrada.');
                    if (parent.parentId !== null) {
                        throw errors.unprocessable('CATEGORY_DEPTH_EXCEEDED', 'Só há dois níveis', { detail: 'Subcategoria não pode ter filhas.' });
                    }
                }
                const [created] = await tx.insert(categories).values(input).returning();
                if (!created)
                    throw new Error('Falha ao criar categoria');
                await this.audit.record(tx, ctx, { action: 'category.create', targetType: 'category', targetId: created.id, after: { ...created } });
                return created;
            });
        }
        catch (error) {
            if (isUniqueViolation(error))
                throw taken();
            throw error;
        }
    }
    async update(id, patch, ctx) {
        if (patch.icon)
            this.assertIcon(patch.icon);
        try {
            return await this.db.transaction(async (tx) => {
                const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for('update');
                if (!before)
                    throw errors.notFound('Categoria não encontrada.');
                const [after] = await tx.update(categories).set({ ...patch, updatedAt: new Date() }).where(eq(categories.id, id)).returning();
                if (!after)
                    throw new Error('Falha ao atualizar categoria');
                await this.audit.record(tx, ctx, { action: 'category.update', targetType: 'category', targetId: id, before: { ...before }, after: { ...after } });
                return after;
            });
        }
        catch (error) {
            if (isUniqueViolation(error))
                throw taken();
            throw error;
        }
    }
    /** WB-106 C2: define a ordem dos irmãos (mesmo pai) pela ordem da lista. */
    async reorder(ids, ctx) {
        await this.db.transaction(async (tx) => {
            const rows = await tx.select().from(categories).where(inArray(categories.id, ids)).for('update');
            if (rows.length !== ids.length)
                throw errors.notFound('Categoria não encontrada.');
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
    async remove(id, ctx) {
        await this.db.transaction(async (tx) => {
            const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for('update');
            if (!before)
                throw errors.notFound('Categoria não encontrada.');
            const children = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, id)));
            if (children.length > 0) {
                throw errors.conflict('CATEGORY_IN_USE', 'Categoria em uso', 'Mova antes ou inative.');
            }
            await tx.delete(categories).where(eq(categories.id, id));
            await this.audit.record(tx, ctx, { action: 'category.delete', targetType: 'category', targetId: id, before: { ...before } });
        });
    }
    /** Seed idempotente por (pai, nome). */
    async ensure(name, icon, position, parentId = null) {
        const [existing] = await this.db
            .select()
            .from(categories)
            .where(and(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId), eq(categories.name, name)));
        if (existing)
            return existing.id;
        const [created] = await this.db.insert(categories).values({ name, icon, position, parentId }).returning();
        if (!created)
            throw new Error('Falha no seed de categorias');
        return created.id;
    }
    assertIcon(icon) {
        if (!CATEGORY_ICONS.includes(icon)) {
            throw errors.unprocessable('CATEGORY_ICON_INVALID', 'Ícone inválido', { errors: [{ field: 'icon', message: 'Use um ícone da biblioteca.' }] });
        }
    }
};
CategoriesService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuditService])
], CategoriesService);
export { CategoriesService };
//# sourceMappingURL=categories.service.js.map