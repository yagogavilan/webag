import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, lte, max, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { users } from '../identity/db/schema.js';
import { termsAcceptances } from '../users/db/schema.js';
import { legalDocuments, type LegalDocumentType } from './db/schema.js';
import { DISPLAY_VARIABLES, forbiddenLegalVariables } from './legal-variables.js';

export type LegalDocument = typeof legalDocuments.$inferSelect;

export interface PublishInput {
  type: LegalDocumentType;
  title: string;
  content: string;
  effectiveAt: Date;
  relevantChange: boolean;
  changeSummary?: string | null;
}

/** WB-117: termos e privacidade versionados (imutáveis); cada tipo tem sua própria sequência. */
@Injectable()
export class LegalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /**
   * SEC-187: a versão publicada é imutável, inclusive nos fatos contratuais. Só `{{SITE_URL}}`, `{{VERSAO}}` e `{{VIGENCIA}}` podem ficar no
   * texto; qualquer outra variável (foro, encarregado, CNPJ...) deve vir já escrita, e trocar um valor é uma versão nova (422).
   */
  async publish(input: PublishInput, ctx: RequestContext): Promise<LegalDocument> {
    const forbidden = forbiddenLegalVariables(input.content);
    if (forbidden.length > 0) {
      throw errors.unprocessable('LEGAL_VARIABLE_NOT_ALLOWED', 'Variável não permitida no texto publicado', {
        detail: `Escreva o valor no texto antes de publicar. Só ${DISPLAY_VARIABLES.map((name) => `{{${name}}}`).join(', ')} podem ficar como variável.`,
        errors: forbidden.map((token) => ({ field: 'content', message: `Variável não permitida: ${token}` })),
      });
    }
    return this.db.transaction(async (tx) => {
      // Serializa publicações do mesmo tipo para a numeração de versão não colidir.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'legal:' + input.type}))`);
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
      if (!created) throw new Error('Falha ao publicar documento');
      await this.audit.record(tx, ctx, {
        action: 'legal.publish',
        targetType: 'legal_document',
        targetId: created.id,
        after: { type: created.type, version: created.version, relevantChange: created.relevantChange, effectiveAt: created.effectiveAt, changeSummary: created.changeSummary, contentSha256: createHash('sha256').update(created.content).digest('hex') },
      });
      return created;
    });
  }

  /** Versão vigente: a maior com `effective_at <= agora`. */
  async current(type: LegalDocumentType): Promise<LegalDocument | null> {
    const [row] = await this.db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.type, type), lte(legalDocuments.effectiveAt, new Date())))
      .orderBy(desc(legalDocuments.version))
      .limit(1);
    return row ?? null;
  }

  async versions(type: LegalDocumentType): Promise<LegalDocument[]> {
    return this.db.select().from(legalDocuments).where(eq(legalDocuments.type, type)).orderBy(desc(legalDocuments.version));
  }

  /** Autor (nome) e quantos usuários aceitaram cada versão, para o histórico do painel (WB-100/101). */
  async annotate(docs: LegalDocument[]): Promise<Map<string, { publishedByName: string | null; acceptances: number }>> {
    const result = new Map<string, { publishedByName: string | null; acceptances: number }>();
    if (docs.length === 0) return result;
    const ids = docs.map((doc) => doc.id);
    const counts = await this.db
      .select({ documentId: termsAcceptances.documentId, total: count() })
      .from(termsAcceptances)
      .where(inArray(termsAcceptances.documentId, ids))
      .groupBy(termsAcceptances.documentId);
    const authorIds = [...new Set(docs.map((doc) => doc.publishedBy).filter((id): id is string => id !== null))];
    const authors = authorIds.length > 0 ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)) : [];
    for (const doc of docs) {
      result.set(doc.id, {
        publishedByName: authors.find((author) => author.id === doc.publishedBy)?.name ?? null,
        acceptances: counts.find((row) => row.documentId === doc.id)?.total ?? 0,
      });
    }
    return result;
  }

  async byId(id: string): Promise<LegalDocument> {
    const [row] = await this.db.select().from(legalDocuments).where(eq(legalDocuments.id, id)).limit(1);
    if (!row) throw errors.notFound('Documento não encontrado.');
    return row;
  }

  /** Versões vigentes posteriores a `version` (para decidir se há mudança relevante pendente de aceite). */
  async publishedAfter(type: LegalDocumentType, version: number): Promise<LegalDocument[]> {
    return this.db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.type, type), gt(legalDocuments.version, version), lte(legalDocuments.effectiveAt, new Date())))
      .orderBy(asc(legalDocuments.version));
  }
}
