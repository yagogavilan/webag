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
import { and, asc, eq, sql } from 'drizzle-orm';
import { CacheService } from '../../platform/cache/cache.service.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from '../admin/index.js';
import { contentSettings, helpFaqs, HELP_GROUPS } from './db/schema.js';
export const CONTACT_KEYS = ['support_whatsapp', 'support_email', 'support_hours', 'privacy_officer_name', 'privacy_officer_email'];
const CACHE_TTL_SECONDS = 60;
/**
 * WB-034 / WB-227 C4 / AJ3: ajuda (FAQ e contatos) do cliente e do lojista. Texto e contatos são CONFIGURAÇÃO editável pelo admin
 * (operação e super admin, auditado), nunca constantes no código; a mesma configuração alimenta o canal do titular (WB-217 C1).
 * A leitura é pública (visitante e lojista usam) e fica em cache de 60 s.
 */
let HelpService = class HelpService {
    db;
    cache;
    audit;
    constructor(db, cache, audit) {
        this.db = db;
        this.cache = cache;
        this.audit = audit;
    }
    async contacts() {
        const rows = await this.db.select().from(contentSettings);
        const get = (key) => rows.find((r) => r.key === key)?.value ?? null;
        return { supportWhatsapp: get('support_whatsapp'), supportEmail: get('support_email'), supportHours: get('support_hours'), privacyOfficerName: get('privacy_officer_name'), privacyOfficerEmail: get('privacy_officer_email') };
    }
    /** Leitura pública: só perguntas publicadas, por grupo na ordem definida; grupo sem pergunta some. */
    async publicHelp(audience) {
        return this.cache.wrap('help', audience, CACHE_TTL_SECONDS, async () => {
            const [faqs, contacts] = await Promise.all([
                this.db.select().from(helpFaqs).where(and(eq(helpFaqs.audience, audience), eq(helpFaqs.published, true))).orderBy(asc(helpFaqs.position), asc(helpFaqs.updatedAt)),
                this.contacts(),
            ]);
            const labels = HELP_GROUPS[audience];
            return {
                audience,
                contacts: { whatsapp: contacts.supportWhatsapp, email: contacts.supportEmail, hours: contacts.supportHours },
                privacy: { officerName: contacts.privacyOfficerName, officerEmail: contacts.privacyOfficerEmail },
                groups: Object.entries(labels)
                    .map(([id, label]) => ({ id, label, items: faqs.filter((f) => f.groupKey === id).map((f) => ({ id: f.id, question: f.question, answer: f.answer })) }))
                    .filter((g) => g.items.length > 0),
            };
        });
    }
    present(f) {
        return { id: f.id, audience: f.audience, group: f.groupKey, question: f.question, answer: f.answer, position: f.position, published: f.published, updatedAt: f.updatedAt.toISOString() };
    }
    assertGroup(audience, group) {
        if (!Object.hasOwn(HELP_GROUPS[audience], group))
            throw errors.validation([{ field: 'group', message: 'Grupo inválido para este público.' }]);
    }
    async listFaqs(audience) {
        const rows = await this.db.select().from(helpFaqs).where(audience ? eq(helpFaqs.audience, audience) : undefined).orderBy(asc(helpFaqs.audience), asc(helpFaqs.groupKey), asc(helpFaqs.position));
        return { data: rows.map((r) => this.present(r)), nextCursor: null };
    }
    async createFaq(ctx, input) {
        this.assertGroup(input.audience, input.group);
        const row = await this.db.transaction(async (tx) => {
            const [last] = await tx.select({ n: sql `coalesce(max(${helpFaqs.position}), -1)::int` }).from(helpFaqs).where(and(eq(helpFaqs.audience, input.audience), eq(helpFaqs.groupKey, input.group)));
            const [created] = await tx.insert(helpFaqs).values({ audience: input.audience, groupKey: input.group, question: input.question, answer: input.answer, position: (last?.n ?? -1) + 1, published: input.published ?? true, updatedBy: ctx.principal?.userId ?? null }).returning();
            if (!created)
                throw new Error('Falha ao criar a pergunta');
            await this.audit.record(tx, ctx, { action: 'help.faq_created', targetType: 'help_faq', targetId: created.id, after: { audience: created.audience, group: created.groupKey, published: created.published } });
            return created;
        });
        await this.cache.bump('help');
        return this.present(row);
    }
    async updateFaq(ctx, id, patch) {
        const [before] = await this.db.select().from(helpFaqs).where(eq(helpFaqs.id, id));
        if (!before)
            throw errors.notFound('Pergunta não encontrada.');
        if (patch.group)
            this.assertGroup(before.audience, patch.group);
        const row = await this.db.transaction(async (tx) => {
            const [updated] = await tx.update(helpFaqs).set({ ...(patch.group ? { groupKey: patch.group } : {}), ...(patch.question ? { question: patch.question } : {}), ...(patch.answer ? { answer: patch.answer } : {}), ...(patch.published === undefined ? {} : { published: patch.published }), updatedBy: ctx.principal?.userId ?? null, updatedAt: new Date() }).where(eq(helpFaqs.id, id)).returning();
            if (!updated)
                throw errors.notFound('Pergunta não encontrada.');
            await this.audit.record(tx, ctx, { action: 'help.faq_updated', targetType: 'help_faq', targetId: id, before: { published: before.published, group: before.groupKey }, after: { published: updated.published, group: updated.groupKey } });
            return updated;
        });
        await this.cache.bump('help');
        return this.present(row);
    }
    async deleteFaq(ctx, id) {
        const gone = await this.db.transaction(async (tx) => {
            const [row] = await tx.delete(helpFaqs).where(eq(helpFaqs.id, id)).returning();
            if (row)
                await this.audit.record(tx, ctx, { action: 'help.faq_deleted', targetType: 'help_faq', targetId: id, before: { audience: row.audience, group: row.groupKey } });
            return row;
        });
        if (!gone)
            throw errors.notFound('Pergunta não encontrada.');
        await this.cache.bump('help');
    }
    /** Nova ordem de UM grupo: `ids` precisa ser exatamente o conjunto de perguntas do grupo (nada some nem duplica). */
    async reorder(ctx, input) {
        this.assertGroup(input.audience, input.group);
        await this.db.transaction(async (tx) => {
            const rows = await tx.select({ id: helpFaqs.id }).from(helpFaqs).where(and(eq(helpFaqs.audience, input.audience), eq(helpFaqs.groupKey, input.group))).for('update');
            const have = new Set(rows.map((r) => r.id));
            if (input.ids.length !== have.size || new Set(input.ids).size !== input.ids.length || !input.ids.every((id) => have.has(id))) {
                throw errors.validation([{ field: 'ids', message: 'Envie todas as perguntas do grupo, uma vez cada.' }]);
            }
            for (const [position, id] of input.ids.entries())
                await tx.update(helpFaqs).set({ position }).where(eq(helpFaqs.id, id));
            await this.audit.record(tx, ctx, { action: 'help.faq_reordered', targetType: 'help_faq', targetId: `${input.audience}:${input.group}`, after: { ids: input.ids } });
        });
        await this.cache.bump('help');
        return this.listFaqs(input.audience);
    }
    async putContacts(ctx, input) {
        const map = { supportWhatsapp: 'support_whatsapp', supportEmail: 'support_email', supportHours: 'support_hours', privacyOfficerName: 'privacy_officer_name', privacyOfficerEmail: 'privacy_officer_email' };
        const before = await this.contacts();
        await this.db.transaction(async (tx) => {
            for (const [field, key] of Object.entries(map)) {
                if (!(field in input))
                    continue;
                const value = input[field];
                if (value === null || value === undefined || value === '')
                    await tx.delete(contentSettings).where(eq(contentSettings.key, key));
                else
                    await tx.insert(contentSettings).values({ key, value, updatedBy: ctx.principal?.userId ?? null }).onConflictDoUpdate({ target: contentSettings.key, set: { value, updatedBy: ctx.principal?.userId ?? null, updatedAt: new Date() } });
            }
            await this.audit.record(tx, ctx, { action: 'help.contacts_updated', targetType: 'content_settings', targetId: 'contacts', before: { ...before }, after: { ...input } });
        });
        await this.cache.bump('help');
        return this.contacts();
    }
};
HelpService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, CacheService,
        AuditService])
], HelpService);
export { HelpService };
//# sourceMappingURL=help.service.js.map