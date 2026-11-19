import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { businessDeadline } from '../stores/index.js';
import { type ReportTarget } from './db/schema.js';

export const REMOVAL_REASONS = ['offense', 'personal_data', 'illegal', 'spam'] as const;
const REMOVAL_TEXT: Record<(typeof REMOVAL_REASONS)[number], string> = { offense: 'ofensa', personal_data: 'dado pessoal', illegal: 'conteúdo ilegal', spam: 'spam' };
const initials = (name: string): string => `${name.trim().split(/\s+/).map((p) => p.slice(0, 1).toUpperCase()).slice(0, 2).join('. ')}.`;

/**
 * WB-038 / WB-124: denúncia de avaliação, produto ou loja e a moderação do admin. O cliente recebe sempre a mesma resposta (também
 * na repetição, sem revelar que já existia). Avaliação só sai por ofensa, dado pessoal, ilegal ou spam: NÃO existe o motivo "avaliação
 * negativa" (RN-12). Produto e loja são encaminhados à moderação própria. O denunciante é avisado por e-mail da decisão.
 */
@Injectable()
export class ContentReportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly mail: MailService,
  ) {}

  // ------------------------------------------------------------------ cliente

  /** O dono da loja e a equipe não denunciam o que é da própria loja. */
  private async ownerStoreId(type: ReportTarget, id: string): Promise<string | null> {
    if (type === 'store') return (await this.db.select({ id: t.stores.id }).from(t.stores).where(and(eq(t.stores.id, id), eq(t.stores.status, 'approved'))))[0]?.id ?? null;
    if (type === 'product') return (await this.db.select({ id: t.products.storeId }).from(t.products).where(eq(t.products.id, id)))[0]?.id ?? null;
    return (await this.db.select({ id: t.reviews.storeId }).from(t.reviews).where(and(eq(t.reviews.id, id), eq(t.reviews.status, 'published'))))[0]?.id ?? null;
  }

  async submit(userId: string, input: { targetType: ReportTarget; targetId: string; reason: (typeof t.contentReports.$inferInsert)['reason']; text?: string | undefined }): Promise<{ received: true }> {
    const storeId = await this.ownerStoreId(input.targetType, input.targetId);
    if (!storeId) throw errors.notFound('Não encontrado.');
    if (input.targetType !== 'review') {
      const [member] = await this.db.select({ id: t.storeMembers.userId }).from(t.storeMembers).where(and(eq(t.storeMembers.storeId, storeId), eq(t.storeMembers.userId, userId)));
      if (member) throw errors.forbidden('CANNOT_REPORT_OWN', 'Você não pode denunciar a sua própria loja.');
    } else {
      const [own] = await this.db.select({ id: t.reviews.id }).from(t.reviews).where(and(eq(t.reviews.id, input.targetId), eq(t.reviews.userId, userId)));
      if (own) return { received: true }; // denunciar a própria avaliação não faz sentido; mesma resposta, nada é gravado
    }
    await this.db.insert(t.contentReports).values({ targetType: input.targetType, targetId: input.targetId, reporterId: userId, reason: input.reason, text: input.text?.trim() || null }).onConflictDoNothing();
    return { received: true };
  }

  /** O que eu já denunciei (o menu mostra "Denunciada" em vez do botão). */
  async mine(userId: string) {
    const rows = await this.db.select({ targetType: t.contentReports.targetType, targetId: t.contentReports.targetId }).from(t.contentReports).where(eq(t.contentReports.reporterId, userId)).orderBy(sql`${t.contentReports.createdAt} desc`).limit(200);
    return { data: rows, nextCursor: null };
  }

  // -------------------------------------------------------------------- admin

  private async preview(type: ReportTarget, id: string): Promise<{ title: string; excerpt: string | null; available: boolean }> {
    if (type === 'review') {
      const [r] = await this.db.select({ comment: t.reviews.comment, rating: t.reviews.rating, status: t.reviews.status }).from(t.reviews).where(eq(t.reviews.id, id));
      return { title: r ? `Avaliação ${r.rating}/5` : 'Avaliação', excerpt: r?.comment?.slice(0, 120) ?? null, available: r?.status === 'published' };
    }
    if (type === 'product') {
      const [p] = await this.db.select({ name: t.products.name, status: t.products.moderationStatus }).from(t.products).where(eq(t.products.id, id));
      return { title: p?.name ?? 'Produto', excerpt: null, available: p !== undefined && p.status !== 'removed' };
    }
    const [s] = await this.db.select({ name: t.stores.name, status: t.stores.status }).from(t.stores).where(eq(t.stores.id, id));
    return { title: s?.name ?? 'Loja', excerpt: null, available: s?.status === 'approved' };
  }

  /** Fila por alvo (várias denúncias do mesmo item viram uma linha): a mais antiga primeiro, com `overdue` depois do prazo. */
  async queue(query: { targetType: ReportTarget; status?: 'open' | 'handled' | undefined; cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const open = (query.status ?? 'open') === 'open';
    const res = await this.db.execute<{ target_id: string; n: number; oldest: Date; reasons: string[] }>(sql`
      select target_id, count(*)::int as n, min(created_at) as oldest, array_agg(distinct reason) as reasons
      from content_reports where target_type = ${query.targetType} and ${open ? sql`status = 'open'` : sql`status <> 'open'`}
      group by target_id
      ${cursor ? sql`having (min(created_at), target_id) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``}
      order by oldest asc, target_id asc limit ${limit + 1}`);
    const days = await this.params.getNumber('denuncia_prazo_dias_uteis');
    const page = res.rows.slice(0, limit);
    const data = await Promise.all(
      page.map(async (row) => {
        const oldest = new Date(row.oldest);
        return { targetType: query.targetType, targetId: row.target_id, reports: row.n, reasons: row.reasons, oldestAt: oldest.toISOString(), overdue: open && Date.now() > businessDeadline(oldest, days).getTime(), ...(await this.preview(query.targetType, row.target_id)) };
      }),
    );
    const last = page.at(-1);
    return { data, nextCursor: res.rows.length > limit && last ? encodeCursor({ at: new Date(last.oldest).toISOString(), id: last.target_id }) : null };
  }

  async detail(type: ReportTarget, id: string) {
    const reports = await this.db.select({ r: t.contentReports, name: t.users.name }).from(t.contentReports).innerJoin(t.users, eq(t.users.id, t.contentReports.reporterId)).where(and(eq(t.contentReports.targetType, type), eq(t.contentReports.targetId, id))).orderBy(asc(t.contentReports.createdAt));
    if (reports.length === 0) throw errors.notFound('Denúncia não encontrada.');
    const base = { targetType: type, targetId: id, ...(await this.preview(type, id)) };
    let item: Record<string, unknown> = {};
    if (type === 'review') {
      const [row] = await this.db.select({ r: t.reviews, author: t.users.name, store: t.stores.name }).from(t.reviews).innerJoin(t.users, eq(t.users.id, t.reviews.userId)).innerJoin(t.stores, eq(t.stores.id, t.reviews.storeId)).where(eq(t.reviews.id, id));
      if (row) item = { rating: row.r.rating, comment: row.r.comment, status: row.r.status, author: initials(row.author), store: row.store, createdAt: row.r.createdAt.toISOString(), storeReply: row.r.storeReply };
    }
    return {
      ...base,
      item,
      reports: reports.map(({ r, name }) => ({ reason: r.reason, text: r.text, reporter: initials(name), status: r.status, reportedAt: r.createdAt.toISOString(), handledAt: r.handledAt?.toISOString() ?? null, resolution: r.resolution })),
    };
  }

  /** Fecha as denúncias abertas do alvo com o resultado e avisa os denunciantes por e-mail (sem dado de quem escreveu a avaliação). */
  private async close(tx: Parameters<Parameters<Db['transaction']>[0]>[0], type: ReportTarget, id: string, status: 'kept' | 'removed' | 'forwarded', ctx: RequestContext, resolution: string): Promise<string[]> {
    const rows = await tx
      .update(t.contentReports)
      .set({ status, handledBy: ctx.principal?.userId ?? null, handledAt: new Date(), resolution })
      .where(and(eq(t.contentReports.targetType, type), eq(t.contentReports.targetId, id), eq(t.contentReports.status, 'open')))
      .returning({ reporterId: t.contentReports.reporterId });
    if (rows.length === 0) throw errors.conflict('REPORT_ALREADY_HANDLED', 'Essa denúncia já foi tratada', 'Atualize a fila.');
    return rows.map((r) => r.reporterId);
  }

  private async notify(userIds: string[], subject: string, text: string): Promise<void> {
    if (userIds.length === 0) return;
    const people = await this.db.select({ email: t.users.email }).from(t.users).where(and(inArray(t.users.id, userIds), eq(t.users.status, 'active')));
    for (const p of people) this.mail.enqueue({ to: p.email, subject, text });
  }

  async keep(ctx: RequestContext, type: ReportTarget, id: string, note?: string) {
    const reporters = await this.db.transaction(async (tx) => {
      const who = await this.close(tx, type, id, 'kept', ctx, note?.slice(0, 200) ?? 'Mantido');
      await this.audit.record(tx, ctx, { action: 'content_report.kept', targetType: type, targetId: id, reason: note });
      return who;
    });
    await this.notify(reporters, 'Analisamos a sua denúncia', `Analisamos a sua denúncia e o conteúdo segue publicado, pois não encontramos violação das regras. Obrigado por avisar.`);
    return { status: 'kept' as const, reports: reporters.length };
  }

  /** Só avaliação sai daqui (ofensa, dado pessoal, ilegal, spam); a nota deixa de contar e o autor é avisado. */
  async removeReview(ctx: RequestContext, id: string, reasonCode: (typeof REMOVAL_REASONS)[number], note?: string) {
    const out = await this.db.transaction(async (tx) => {
      const [review] = await tx.select().from(t.reviews).where(eq(t.reviews.id, id)).for('update');
      if (!review) throw errors.notFound('Avaliação não encontrada.');
      const reporters = await this.close(tx, 'review', id, 'removed', ctx, `${REMOVAL_TEXT[reasonCode]}${note ? `: ${note}` : ''}`.slice(0, 200));
      await tx.update(t.reviews).set({ status: 'removed' }).where(eq(t.reviews.id, id));
      await this.audit.record(tx, ctx, { action: 'review.removed', targetType: 'review', targetId: id, before: { status: review.status }, after: { status: 'removed' }, reason: `${reasonCode}${note ? `: ${note}` : ''}` });
      return { reporters, authorId: review.userId };
    });
    await this.notify(out.reporters, 'Analisamos a sua denúncia', 'Analisamos a sua denúncia e a avaliação foi removida. Obrigado por avisar.');
    await this.notify([out.authorId], 'Sua avaliação foi removida', `Sua avaliação foi removida por ${REMOVAL_TEXT[reasonCode]}. Não removemos avaliação só por ser negativa.`);
    return { status: 'removed' as const, reports: out.reporters.length };
  }

  async forward(ctx: RequestContext, type: Exclude<ReportTarget, 'review'>, id: string) {
    const reporters = await this.db.transaction(async (tx) => {
      const who = await this.close(tx, type, id, 'forwarded', ctx, 'Encaminhado à moderação');
      await this.audit.record(tx, ctx, { action: 'content_report.forwarded', targetType: type, targetId: id });
      return who;
    });
    return { status: 'forwarded' as const, reports: reporters.length, next: type === 'product' ? { moderation: 'product', productId: id } : { moderation: 'store', storeId: id } };
  }
}
