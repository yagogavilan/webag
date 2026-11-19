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
import { and, asc, count, desc, eq, gt, inArray, lte, max, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { users } from '../identity/db/schema.js';
import { termsAcceptances } from '../users/db/schema.js';
import { legalDocuments } from './db/schema.js';
/** WB-117: termos e privacidade versionados (imutáveis); cada tipo tem sua própria sequência. */
let LegalService = class LegalService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    async publish(input, ctx) {
        return this.db.transaction(async (tx) => {
            // Serializa publicações do mesmo tipo para a numeração de versão não colidir.
            await tx.execute(sql `select pg_advisory_xact_lock(hashtext(${'legal:' + input.type}))`);
            const [row] = await tx
                .select({ last: max(legalDocuments.version) })
                .from(legalDocuments)
                .where(eq(legalDocuments.type, input.type));
            const [created] = await tx
                .insert(legalDocuments)
                .values({
                type: input.type,
                version: (row?.last ?? 0) + 1,
                title: input.title,
                content: input.content,
                effectiveAt: input.effectiveAt,
                relevantChange: input.relevantChange,
                changeSummary: input.changeSummary ?? null,
                publishedBy: ctx.principal?.userId ?? null,
            })
                .returning();
            if (!created)
                throw new Error('Falha ao publicar documento');
            await this.audit.record(tx, ctx, {
                action: 'legal.publish',
                targetType: 'legal_document',
                targetId: created.id,
                after: { type: created.type, version: created.version, relevantChange: created.relevantChange, effectiveAt: created.effectiveAt, changeSummary: created.changeSummary },
            });
            return created;
        });
    }
    /** Versão vigente: a maior com `effective_at <= agora`. */
    async current(type) {
        const [row] = await this.db
            .select()
            .from(legalDocuments)
            .where(and(eq(legalDocuments.type, type), lte(legalDocuments.effectiveAt, new Date())))
            .orderBy(desc(legalDocuments.version))
            .limit(1);
        return row ?? null;
    }
    async versions(type) {
        return this.db.select().from(legalDocuments).where(eq(legalDocuments.type, type)).orderBy(desc(legalDocuments.version));
    }
    /** Autor (nome) e quantos usuários aceitaram cada versão, para o histórico do painel (WB-100/101). */
    async annotate(docs) {
        const result = new Map();
        if (docs.length === 0)
            return result;
        const ids = docs.map((doc) => doc.id);
        const counts = await this.db
            .select({ documentId: termsAcceptances.documentId, total: count() })
            .from(termsAcceptances)
            .where(inArray(termsAcceptances.documentId, ids))
            .groupBy(termsAcceptances.documentId);
        const authorIds = [...new Set(docs.map((doc) => doc.publishedBy).filter((id) => id !== null))];
        const authors = authorIds.length > 0 ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)) : [];
        for (const doc of docs) {
            result.set(doc.id, {
                publishedByName: authors.find((author) => author.id === doc.publishedBy)?.name ?? null,
                acceptances: counts.find((row) => row.documentId === doc.id)?.total ?? 0,
            });
        }
        return result;
    }
    async byId(id) {
        const [row] = await this.db.select().from(legalDocuments).where(eq(legalDocuments.id, id)).limit(1);
        if (!row)
            throw errors.notFound('Documento não encontrado.');
        return row;
    }
    /** Versões vigentes posteriores a `version` (para decidir se há mudança relevante pendente de aceite). */
    async publishedAfter(type, version) {
        return this.db
            .select()
            .from(legalDocuments)
            .where(and(eq(legalDocuments.type, type), gt(legalDocuments.version, version), lte(legalDocuments.effectiveAt, new Date())))
            .orderBy(asc(legalDocuments.version));
    }
};
LegalService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuditService])
], LegalService);
export { LegalService };
//# sourceMappingURL=legal.service.js.map