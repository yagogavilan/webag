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
import { AppError, errors } from '../../platform/http/app-error.js';
import { LegalService } from '../admin/index.js';
import { CONSENT_PURPOSES, consents, termsAcceptances } from './db/schema.js';
import { legalDocuments } from '../admin/db/schema.js';
/** Documentos exigidos por papel (WB-210 C1/C4). */
export function requiredDocumentTypes(roles) {
    return roles.includes('merchant')
        ? ['customer_terms', 'privacy', 'merchant_terms']
        : ['customer_terms', 'privacy'];
}
let UsersService = class UsersService {
    db;
    legal;
    constructor(db, legal) {
        this.db = db;
        this.legal = legal;
    }
    /**
     * Confere que o cliente aceitou exatamente as versões VIGENTES dos tipos exigidos e devolve os IDs.
     * Versão antiga ou tipo faltando: 409 TERMS_OUTDATED (o app recarrega o texto e pede o aceite de novo).
     */
    async resolveAcceptance(accepted, required) {
        const ids = [];
        for (const type of required) {
            const current = await this.legal.current(type);
            if (!current) {
                // Sem documento publicado não há como aceitar: erro de configuração, não do usuário.
                throw new AppError(503, 'LEGAL_NOT_PUBLISHED', 'Termos ainda não publicados', { detail: 'Tente novamente mais tarde.' });
            }
            const match = accepted.find((doc) => doc.type === type && doc.version === current.version);
            if (!match) {
                throw errors.conflict('TERMS_OUTDATED', 'Termos desatualizados', 'Leia e aceite a versão atual dos termos.');
            }
            ids.push(current.id);
        }
        return ids;
    }
    async recordAcceptance(executor, userId, documentIds, ctx) {
        if (documentIds.length === 0)
            return;
        await executor.insert(termsAcceptances).values(documentIds.map((documentId) => ({ userId, documentId, ip: ctx.ip, platform: platformFamilyOf(ctx.userAgent) })));
    }
    /** WB-210 C3: o que o usuário ainda precisa aceitar. */
    async pendingTerms(userId, roles) {
        const pending = [];
        for (const type of requiredDocumentTypes(roles)) {
            const current = await this.legal.current(type);
            if (!current)
                continue;
            const [last] = await this.db
                .select({ version: legalDocuments.version })
                .from(termsAcceptances)
                .innerJoin(legalDocuments, eq(legalDocuments.id, termsAcceptances.documentId))
                .where(and(eq(termsAcceptances.userId, userId), eq(legalDocuments.type, type)))
                .orderBy(desc(legalDocuments.version))
                .limit(1);
            if (!last) {
                pending.push({ type, documentId: current.id, version: current.version, title: current.title, reason: 'first' });
                continue;
            }
            if (current.version > last.version) {
                const newer = await this.legal.publishedAfter(type, last.version);
                if (newer.some((doc) => doc.relevantChange)) {
                    pending.push({ type, documentId: current.id, version: current.version, title: current.title, reason: 'relevant_change' });
                }
            }
        }
        return pending;
    }
    async acceptTerms(userId, roles, accepted, ctx) {
        const pending = await this.pendingTerms(userId, roles);
        const toAccept = pending.map((term) => term.type);
        const ids = await this.resolveAcceptance(accepted, toAccept);
        await this.recordAcceptance(this.db, userId, ids, ctx);
        return this.pendingTerms(userId, roles);
    }
    /** Estado atual de cada finalidade: o último evento. Sem evento = não concedido (WB-211 C1). */
    async consentState(userId) {
        const rows = await this.db
            .select()
            .from(consents)
            .where(and(eq(consents.userId, userId), inArray(consents.purpose, [...CONSENT_PURPOSES])))
            .orderBy(desc(consents.createdAt), desc(consents.id));
        const state = Object.fromEntries(CONSENT_PURPOSES.map((purpose) => [purpose, false]));
        const seen = new Set();
        for (const row of rows) {
            if (seen.has(row.purpose))
                continue;
            seen.add(row.purpose);
            state[row.purpose] = row.granted;
        }
        return state;
    }
    /** WB-211 C2/C3: concede ou revoga, gravando tipo, versão do texto, data/hora e canal. */
    async setConsent(executor, userId, purpose, granted, channel, ctx) {
        const privacy = await this.legal.current('privacy');
        await executor.insert(consents).values({
            userId,
            purpose,
            granted,
            textVersion: privacy ? `privacy:v${privacy.version}` : 'privacy:v0',
            channel,
            ip: ctx.ip,
        });
    }
};
UsersService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, LegalService])
], UsersService);
export { UsersService };
/**
 * SEC-173 / LGPD: o aceite guarda só a família da plataforma (`ios`, `android` ou `web`) e a versão do app (`android;1.4.0`), nunca o user
 * agent inteiro (modelo do aparelho e do sistema identificam a pessoa). Sem user agent: nulo.
 */
export function platformFamilyOf(userAgent) {
    if (!userAgent)
        return null;
    const family = /iphone|ipad|ipod|ios|cfnetwork|darwin/i.test(userAgent) ? 'ios' : /android|okhttp|dalvik/i.test(userAgent) ? 'android' : 'web';
    const version = /\bwebag(?:-app)?\/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]{1,10})?)/i.exec(userAgent)?.[1];
    return version ? `${family};${version}` : family;
}
//# sourceMappingURL=users.service.js.map