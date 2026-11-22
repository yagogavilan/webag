import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { actorKindOf, asHistoryObject, AuditService, decodeReason, historyTypeOf, summaryOf, targetTypeOf } from '../admin/index.js';
import { ADMIN_REASON_CODES, AdminStoreEditService, StoreSettingsService, StoresService } from '../stores/index.js';
import { orders } from '../orders/db/schema.js';
import { products } from '../catalog/db/schema.js';
import { users } from '../identity/db/schema.js';

const DAY_MS = 86_400_000;
const MIN_ORDERS_FOR_PCT = 20; // DEC-108: abaixo de 20 pedidos a taxa vira "poucos dados"
const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const TARGET_LABEL: Record<string, string | null> = { hours: 'Horário', holidays: 'Feriados', delivery: 'Entrega', pickup: 'Retirada', exchange_policy: 'Política de trocas', pause: 'Pausa', profile: 'Dados da loja' };

/** Minuto do dia e dia da semana no fuso de Brasília (a loja abre e fecha no horário local). */
function localClock(now: Date): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Ficha 360 e histórico por loja no admin (WB-350). Vive em `backoffice` (o módulo das telas de operação que cruzam módulos) e lê pedidos e produtos
 * por consultas agregadas próprias, sem JOIN com a loja. NÃO traz documento, razão social, conta de recebimento nem dado de cliente (C4).
 */
@Injectable()
export class StoreOverviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly stores: StoresService,
    private readonly settings: StoreSettingsService,
    private readonly edits: AdminStoreEditService,
    private readonly audit: AuditService,
  ) {}

  async overview(storeId: string, now = new Date()) {
    const store = await this.stores.getStore(storeId);
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [settings, open, hours, commission, live, [owner], [activeProducts], [agg], recent] = await Promise.all([
      this.stores.getSettings(storeId),
      this.settings.isOpenNow(storeId, now),
      this.settings.weeklyHours(storeId),
      this.stores.commissionView(storeId),
      this.stores.isLive(store),
      this.db.select({ name: users.name }).from(users).where(eq(users.id, store.ownerUserId)),
      this.db.select({ n: count() }).from(products).where(and(eq(products.storeId, storeId), eq(products.status, 'active'))),
      this.db
        .select({
          orders: count(),
          gmv: sql<number>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalCents} else 0 end), 0)::bigint`,
          cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), isNotNull(orders.paidAt), gte(orders.createdAt, since))),
      this.db
        .select({ id: orders.id, status: orders.status, total: orders.totalCents, createdAt: orders.createdAt })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), isNotNull(orders.paidAt)))
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(5),
    ]);

    // "Fecha às": fim do intervalo em que a loja está agora (hora local); nulo fechada ou sem intervalo.
    let closesAt: string | null = null;
    if (open) {
      const { weekday, minute } = localClock(now);
      const current = (hours[weekday] ?? []).find((i) => minute >= i.startMin && minute < i.endMin);
      if (current) closesAt = new Date(now.getTime() + (current.endMin - minute) * 60_000).toISOString();
    }
    const paused = settings.pausedIndefinitely || (settings.pausedUntil?.getTime() ?? 0) > now.getTime();
    const attribution = paused ? await this.edits.pauseAttribution(storeId) : null;
    // Comissão efetiva e a ORIGEM (RN-10): taxa da loja; a da categoria principal da loja (sem resolver herança da árvore: só correspondência direta); ou a padrão.
    const ownCategory = commission.source === 'default' ? commission.categories.find((c) => c.categoryId === store.mainCategoryId) : undefined;
    const effective = ownCategory
      ? { pct: ownCategory.pct, source: 'category' as const, sourceLabel: `Categoria da loja: ${ownCategory.pct}%` }
      : commission.source === 'store'
        ? { pct: commission.pct, source: 'store' as const, sourceLabel: `Taxa própria da loja: ${commission.pct}%` }
        : { pct: commission.pct, source: 'default' as const, sourceLabel: `Padrão da Webag: ${commission.pct}%` };
    const total = Number(agg?.orders ?? 0);
    const cancelled = Number(agg?.cancelled ?? 0);

    return {
      store: {
        id: store.id,
        name: store.name,
        status: store.status,
        city: store.addressCityName,
        ownerName: owner?.name ?? null,
        version: store.version,
        live,
        phone: store.phone,
        whatsapp: store.whatsapp,
        description: store.description,
      },
      operation: {
        openNow: open,
        closesAt,
        pause: paused ? { until: settings.pausedIndefinitely ? null : (settings.pausedUntil?.toISOString() ?? null), by: attribution?.byAdmin ? ('admin' as const) : ('merchant' as const), reasonLabel: attribution?.reasonLabel ?? null } : null,
      },
      commission: effective,
      indicators: {
        empty: total === 0,
        activeProducts: activeProducts?.n ?? 0,
        orders: total,
        gmv: money(Number(agg?.gmv ?? 0)),
        cancellations: { count: cancelled, pct: total >= MIN_ORDERS_FOR_PCT ? Math.round((cancelled / total) * 1000) / 10 : null },
      },
      recentOrders: recent.map((o) => ({ id: o.id, status: o.status, total: money(o.total), createdAt: o.createdAt.toISOString() })),
    };
  }

  async history(storeId: string, query: { type?: string | undefined; actorAdminId?: string | undefined; from?: string | undefined; to?: string | undefined; cursor?: string | undefined; limit?: unknown }) {
    await this.stores.getStore(storeId); // 404 para loja inexistente
    const range = dateRange(query.from, query.to);
    const page = await this.audit.storeHistory(storeId, { ...(query.type ? { type: query.type as never } : {}), ...(query.actorAdminId ? { actorId: query.actorAdminId } : {}), ...range, ...(query.cursor ? { cursor: query.cursor } : {}), ...(query.limit !== undefined ? { limit: query.limit } : {}) });
    return {
      data: page.data.map((row) => {
        const type = historyTypeOf(row.action);
        const before = asHistoryObject(row.before);
        const after = asHistoryObject(row.after);
        return {
          id: row.id,
          at: row.at.toISOString(),
          type,
          target: { type: targetTypeOf(type), id: storeId, label: TARGET_LABEL[type] ?? null },
          actor: { kind: actorKindOf(row.actorId, row.actorRole), name: row.actorName },
          summary: summaryOf(row.action, before, after),
          before: stripPii(before),
          after: stripPii(after),
          reason: decodeReason(row.reason, ADMIN_REASON_CODES),
          restorable: false,
          restoredByEntryId: null,
        };
      }),
      nextCursor: page.nextCursor,
    };
  }
}

/** Filtro de data em America/Sao_Paulo (`AAAA-MM-DD`), no máximo 400 dias (contrato). */
function dateRange(from?: string, to?: string): { from?: Date; to?: Date } {
  const parse = (v: string | undefined, endOfDay: boolean): Date | undefined => {
    if (!v) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw errors.validation([{ field: endOfDay ? 'to' : 'from', message: 'Use a data no formato AAAA-MM-DD.' }]);
    const date = new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`);
    if (Number.isNaN(date.getTime())) throw errors.validation([{ field: endOfDay ? 'to' : 'from', message: 'Data inválida.' }]);
    return date;
  };
  const start = parse(from, false);
  const end = parse(to, true);
  if (start && end && end.getTime() - start.getTime() > 400 * DAY_MS) throw errors.validation([{ field: 'to', message: 'O período vai até 400 dias.' }]);
  if (start && end && end < start) throw errors.validation([{ field: 'to', message: 'A data final é anterior à inicial.' }]);
  return { ...(start ? { from: start } : {}), ...(end ? { to: end } : {}) };
}

/** Defesa em profundidade: a trilha da loja nunca devolve chave que lembre dado pessoal de cliente (a trilha das ações do admin não os grava; isto é a segunda barreira). */
const PII_KEY = /^(cpf|email|customer\w*|document\w*|street|cep|lat|lng)$/i;
function stripPii(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).filter(([k]) => !PII_KEY.test(k)).map(([k, v]) => [k, walk(v)]));
    return input;
  };
  return walk(value) as Record<string, unknown>;
}
