import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import type { Principal } from '../../platform/auth/decorators.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { LegalService, type LegalDocumentType } from '../admin/index.js';
import { CONSENT_PURPOSES, consents, termsAcceptances, type ConsentPurpose } from './db/schema.js';
import { legalDocuments } from '../admin/db/schema.js';

export interface DocumentRef {
  type: LegalDocumentType;
  version: number;
}

export interface PendingTerm {
  type: LegalDocumentType;
  documentId: string;
  version: number;
  title: string;
  /** `first` = nunca aceitou; `relevant_change` = mudança relevante publicada depois do último aceite (WB-210 C3). */
  reason: 'first' | 'relevant_change';
}

type Role = Principal['roles'][number];

/** Documentos exigidos por papel (WB-210 C1/C4). */
export function requiredDocumentTypes(roles: readonly Role[]): LegalDocumentType[] {
  return roles.includes('merchant')
    ? ['customer_terms', 'privacy', 'merchant_terms']
    : ['customer_terms', 'privacy'];
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly legal: LegalService,
  ) {}

  /**
   * Confere que o cliente aceitou exatamente as versões VIGENTES dos tipos exigidos e devolve os IDs.
   * Versão antiga ou tipo faltando: 409 TERMS_OUTDATED (o app recarrega o texto e pede o aceite de novo).
   */
  async resolveAcceptance(accepted: DocumentRef[], required: LegalDocumentType[]): Promise<string[]> {
    const ids: string[] = [];
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

  async recordAcceptance(executor: DbOrTx, userId: string, documentIds: string[], ctx: RequestContext): Promise<void> {
    if (documentIds.length === 0) return;
    await executor.insert(termsAcceptances).values(
      documentIds.map((documentId) => ({ userId, documentId, ip: ctx.ip, platform: platformFamilyOf(ctx.userAgent) })),
    );
  }

  /** WB-210 C3: o que o usuário ainda precisa aceitar. */
  async pendingTerms(userId: string, roles: readonly Role[]): Promise<PendingTerm[]> {
    const pending: PendingTerm[] = [];
    for (const type of requiredDocumentTypes(roles)) {
      const current = await this.legal.current(type);
      if (!current) continue;
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

  async acceptTerms(userId: string, roles: readonly Role[], accepted: DocumentRef[], ctx: RequestContext): Promise<PendingTerm[]> {
    const pending = await this.pendingTerms(userId, roles);
    const toAccept = pending.map((term) => term.type);
    const ids = await this.resolveAcceptance(accepted, toAccept);
    await this.recordAcceptance(this.db, userId, ids, ctx);
    return this.pendingTerms(userId, roles);
  }

  /** Estado atual de cada finalidade: o último evento. Sem evento = não concedido (WB-211 C1). */
  async consentState(userId: string): Promise<Record<ConsentPurpose, boolean>> {
    const rows = await this.db
      .select()
      .from(consents)
      .where(and(eq(consents.userId, userId), inArray(consents.purpose, [...CONSENT_PURPOSES])))
      .orderBy(desc(consents.createdAt), desc(consents.id));
    const state = Object.fromEntries(CONSENT_PURPOSES.map((purpose) => [purpose, false])) as Record<ConsentPurpose, boolean>;
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.purpose)) continue;
      seen.add(row.purpose);
      state[row.purpose] = row.granted;
    }
    return state;
  }

  /** WB-211 C2/C3: concede ou revoga, gravando tipo, versão do texto, data/hora e canal. */
  async setConsent(
    executor: DbOrTx,
    userId: string,
    purpose: ConsentPurpose,
    granted: boolean,
    channel: string,
    ctx: RequestContext,
  ): Promise<void> {
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
}

/**
 * SEC-173 / LGPD: o aceite guarda só a família da plataforma (`ios`, `android` ou `web`) e a versão do app (`android;1.4.0`), nunca o user
 * agent inteiro (modelo do aparelho e do sistema identificam a pessoa). Sem user agent: nulo.
 */
export function platformFamilyOf(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const family = /iphone|ipad|ipod|ios|cfnetwork|darwin/i.test(userAgent) ? 'ios' : /android|okhttp|dalvik/i.test(userAgent) ? 'android' : 'web';
  const version = /\bwebag(?:-app)?\/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]{1,10})?)/i.exec(userAgent)?.[1];
  return version ? `${family};${version}` : family;
}
