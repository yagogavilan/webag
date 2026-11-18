import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, lte, max, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { legalDocuments, type LegalDocumentType } from './db/schema.js';

export type LegalDocument = typeof legalDocuments.$inferSelect;

export interface PublishInput {
  type: LegalDocumentType;
  title: string;
  content: string;
  effectiveAt: Date;
  relevantChange: boolean;
}

/** WB-117: termos e privacidade versionados (imutáveis); cada tipo tem sua própria sequência. */
@Injectable()
export class LegalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async publish(input: PublishInput, ctx: RequestContext): Promise<LegalDocument> {
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
          publishedBy: ctx.principal?.userId ?? null,
        })
        .returning();
      if (!created) throw new Error('Falha ao publicar documento');
      await this.audit.record(tx, ctx, {
        action: 'legal.publish',
        targetType: 'legal_document',
        targetId: created.id,
        after: { type: created.type, version: created.version, relevantChange: created.relevantChange, effectiveAt: created.effectiveAt },
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
