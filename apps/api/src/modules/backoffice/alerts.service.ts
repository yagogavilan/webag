import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { ALERT_AREAS, ALERT_KINDS, ALERT_SEVERITIES, AuditService, alertKindInfo, alertKindsVisibleTo, canSeeAlertKind, type AlertArea, type AlertSeverity } from '../admin/index.js';
import { users, type AdminProfile } from '../identity/db/schema.js';
import { paymentAlerts, paymentAttempts } from '../payments/db/schema.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AlertView {
  id: string;
  kind: string;
  label: string;
  area: AlertArea;
  severity: AlertSeverity;
  /** O que fazer, em uma frase. */
  hint: string;
  status: 'open' | 'resolved';
  attemptId: string | null;
  /** Os dados do alerta como o sistema gravou (ids, valores, minutos); sem dado pessoal do cliente. */
  details: Record<string, unknown>;
  /** Atalhos para a tela do assunto (o painel monta o link). */
  links: { orderId: string | null; storeId: string | null; deliveryId: string | null; exchangeId: string | null };
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
}

export interface AlertQuery {
  status?: 'open' | 'resolved' | 'all' | undefined;
  area?: AlertArea | undefined;
  severity?: AlertSeverity | undefined;
  kind?: string | undefined;
  cursor?: string | undefined;
  limit?: unknown;
}

/**
 * B3 / WB-198 / WB-113 (leitura): a caixa de alertas de operação do admin. Lê `payment_alerts` (onde todo alerta do sistema cai), traduz pelo catálogo e
 * corta por perfil NO SERVIDOR: alerta de um tipo que o perfil não vê nem aparece na contagem, e o detalhe dele responde 404 (não revela que existe).
 * "Resolver" é encerrar com nota (Resolvida, WB-113 C2 recortado): o ajuste de divergência (gerar ajuste auditado) e o alerta de 3 dias são fase 2 (DEC-071).
 */
@Injectable()
export class AlertsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** Filtro de tipos do perfil (o super admin vê todos, inclusive os desconhecidos). */
  private visible(profile: AdminProfile): SQL | undefined {
    const scope = alertKindsVisibleTo(profile);
    return scope.all ? undefined : scope.kinds.length > 0 ? inArray(paymentAlerts.kind, scope.kinds) : sql`false`;
  }

  /** Tipos do catálogo que o perfil vê, para os filtros do painel. */
  kinds(profile: AdminProfile) {
    return Object.entries(ALERT_KINDS)
      .filter(([, info]) => info.audience.includes(profile))
      .map(([kind, info]) => ({ kind, label: info.label, area: info.area, severity: info.severity, hint: info.hint }))
      .sort((a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label));
  }

  async list(profile: AdminProfile, query: AlertQuery): Promise<Page<AlertView>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const status = query.status ?? 'open';
    // area e gravidade viram uma lista de tipos do catálogo (um tipo desconhecido só entra sem esses filtros).
    const byCatalog = (accept: (info: ReturnType<typeof alertKindInfo>) => boolean): SQL =>
      inArray(paymentAlerts.kind, Object.entries(ALERT_KINDS).filter(([, info]) => accept(info)).map(([kind]) => kind).concat('__none__'));
    const rows = await this.db
      .select({ alert: paymentAlerts, resolvedByName: users.name, reference: paymentAttempts.externalReference })
      .from(paymentAlerts)
      .leftJoin(users, eq(users.id, paymentAlerts.resolvedBy))
      .leftJoin(paymentAttempts, eq(paymentAttempts.id, paymentAlerts.attemptId))
      .where(
        and(
          this.visible(profile),
          status === 'open' ? isNull(paymentAlerts.resolvedAt) : status === 'resolved' ? isNotNull(paymentAlerts.resolvedAt) : undefined,
          query.kind ? eq(paymentAlerts.kind, query.kind) : undefined,
          query.area ? byCatalog((info) => info.area === query.area) : undefined,
          query.severity ? byCatalog((info) => info.severity === query.severity) : undefined,
          timestampCursorBefore(paymentAlerts.createdAt, paymentAlerts.id, cursor),
        ),
      )
      .orderBy(...timestampOrderDesc(paymentAlerts.createdAt, paymentAlerts.id))
      .limit(limit + 1);
    const data = rows.slice(0, limit).map((r) => this.present(r.alert, r.resolvedByName, r.reference));
    const last = rows.length > limit ? rows[limit - 1]?.alert : undefined;
    return { data, nextCursor: last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  async get(profile: AdminProfile, id: string): Promise<AlertView> {
    const [row] = await this.db
      .select({ alert: paymentAlerts, resolvedByName: users.name, reference: paymentAttempts.externalReference })
      .from(paymentAlerts)
      .leftJoin(users, eq(users.id, paymentAlerts.resolvedBy))
      .leftJoin(paymentAttempts, eq(paymentAttempts.id, paymentAlerts.attemptId))
      .where(eq(paymentAlerts.id, id));
    if (!row || !canSeeAlertKind(profile, row.alert.kind)) throw errors.notFound('Alerta não encontrado.');
    return this.present(row.alert, row.resolvedByName, row.reference);
  }

  /** Contagem dos abertos do perfil: o contador do Início e das áreas do admin. */
  async summary(profile: AdminProfile) {
    const grouped = await this.db
      .select({ kind: paymentAlerts.kind, n: sql<number>`count(*)::int`, oldest: sql<Date>`min(${paymentAlerts.createdAt})` })
      .from(paymentAlerts)
      .where(and(isNull(paymentAlerts.resolvedAt), this.visible(profile)))
      .groupBy(paymentAlerts.kind);
    const bySeverity = Object.fromEntries(ALERT_SEVERITIES.map((s) => [s, 0])) as Record<AlertSeverity, number>;
    const byArea = Object.fromEntries(ALERT_AREAS.map((a) => [a, 0])) as Record<AlertArea, number>;
    let open = 0;
    let oldest: Date | null = null;
    for (const g of grouped) {
      const info = alertKindInfo(g.kind);
      open += g.n;
      bySeverity[info.severity] += g.n;
      byArea[info.area] += g.n;
      const at = new Date(g.oldest);
      if (!oldest || at < oldest) oldest = at;
    }
    const byKind = grouped
      .map((g) => ({ kind: g.kind, label: alertKindInfo(g.kind).label, area: alertKindInfo(g.kind).area, severity: alertKindInfo(g.kind).severity, count: g.n }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { open, bySeverity, byArea, byKind, oldestOpenAt: oldest?.toISOString() ?? null };
  }

  /**
   * Encerra o alerta à mão com a nota (WB-113 C2 "Resolvida"): quem, quando e por quê ficam no alerta e na auditoria. Só quem vê o tipo encerra
   * (outro perfil recebe 404). Encerrar de novo é 409. Se o mesmo problema voltar, o sistema abre um alerta novo.
   */
  async resolve(profile: AdminProfile, id: string, note: string, ctx: RequestContext): Promise<AlertView> {
    await this.db.transaction(async (tx) => {
      const [alert] = await tx.select().from(paymentAlerts).where(eq(paymentAlerts.id, id)).for('update');
      if (!alert || !canSeeAlertKind(profile, alert.kind)) throw errors.notFound('Alerta não encontrado.');
      if (alert.resolvedAt) throw errors.conflict('ALERT_ALREADY_RESOLVED', 'Alerta já encerrado', 'Outra pessoa já encerrou este alerta.');
      await tx.update(paymentAlerts).set({ resolvedAt: new Date(), resolvedBy: ctx.principal?.userId ?? null, resolutionNote: note }).where(eq(paymentAlerts.id, id));
      await this.audit.record(tx, ctx, { action: 'alert.resolve', targetType: 'alert', targetId: id, before: { kind: alert.kind, open: true }, after: { open: false }, reason: note });
    });
    return this.get(profile, id);
  }

  private present(alert: typeof paymentAlerts.$inferSelect, resolvedByName: string | null, reference: string | null): AlertView {
    const info = alertKindInfo(alert.kind);
    const details = alert.details;
    const id = (value: unknown): string | null => (typeof value === 'string' && UUID_RE.test(value) ? value : null);
    // Pagamento de pedido: a referência da tentativa é o id do pedido (troca tem o `exchangeId` nos detalhes).
    const orderFromAttempt = alert.kind.startsWith('exchange_') ? null : id(reference);
    return {
      id: alert.id,
      kind: alert.kind,
      label: info.label,
      area: info.area,
      severity: info.severity,
      hint: info.hint,
      status: alert.resolvedAt ? 'resolved' : 'open',
      attemptId: alert.attemptId,
      details,
      links: { orderId: id(details.orderId) ?? orderFromAttempt, storeId: id(details.storeId), deliveryId: id(details.deliveryId), exchangeId: id(details.exchangeId) },
      createdAt: alert.createdAt.toISOString(),
      resolvedAt: alert.resolvedAt?.toISOString() ?? null,
      resolvedByName,
      resolutionNote: alert.resolutionNote,
    };
  }
}
