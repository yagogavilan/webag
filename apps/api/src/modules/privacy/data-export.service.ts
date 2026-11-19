import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { dataExportReadyEmail } from '../../platform/mail/templates.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../platform/storage/object-storage.js';
import { isUniqueViolation } from '../admin/util.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { AuthService } from '../identity/index.js';
import { dataExportLinks, dataExports } from './db/schema.js';

/** Teto do arquivo: o export de uma conta comum tem KBs; acima disto algo está errado e a exportação falha em vez de estourar a memória. */
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 5_000;
const MAX_FAILURES = 3;
const SYSTEM_CTX: RequestContext = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };

export interface ExportStatusView {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
  requestedAt: string;
  readyAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
}

const present = (row: typeof dataExports.$inferSelect): ExportStatusView => ({
  id: row.id,
  status: row.status,
  requestedAt: row.requestedAt.toISOString(),
  readyAt: row.readyAt?.toISOString() ?? null,
  expiresAt: row.expiresAt?.toISOString() ?? null,
  sizeBytes: row.sizeBytes,
});

/**
 * WB-212: exportação dos dados do titular. Assíncrona (a varredura monta o arquivo), com senha (DEC-015), e-mail confirmado
 * (SEC-008b) e no máximo 1 por dia. O arquivo vai para o bucket privado; o e-mail só avisa (sem link nem dado); o download é um
 * link de uso único (256 bits, só o hash no banco, `exportacao_link_min`) pedido por quem está logado e é o dono.
 *
 * O arquivo traz só dados DO titular: nada de senha, token, hash, CPF de terceiros nem dados do comprador nos pedidos da loja.
 */
@Injectable()
export class DataExportService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DataExportService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly auth: AuthService,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timers.push(setInterval(() => void this.processQueue().catch((e: Error) => this.logger.error(e.message)), 30_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  // ----------------------------------------------------------------- titular

  async request(principal: Principal, password: string, ctx: RequestContext): Promise<ExportStatusView> {
    // SEC-008(b): exportação exige e-mail confirmado.
    if (!principal.emailVerified) throw errors.forbidden('EMAIL_VERIFICATION_REQUIRED', 'Confirme seu e-mail para exportar seus dados.');
    await this.auth.confirmPassword(principal.userId, password, ctx, 'export_data');

    const [open] = await this.db.select({ id: dataExports.id }).from(dataExports).where(and(eq(dataExports.userId, principal.userId), inArray(dataExports.status, ['queued', 'processing'])));
    if (open) throw errors.conflict('EXPORT_IN_PROGRESS', 'Você já tem uma exportação em andamento', 'Avisamos por e-mail quando ela ficar pronta.');
    const [recent] = await this.db
      .select({ requestedAt: dataExports.requestedAt })
      .from(dataExports)
      .where(and(eq(dataExports.userId, principal.userId), gt(dataExports.requestedAt, new Date(Date.now() - 86_400_000))))
      .orderBy(desc(dataExports.requestedAt))
      .limit(1);
    if (recent) {
      const retry = Math.max(1, Math.ceil((recent.requestedAt.getTime() + 86_400_000 - Date.now()) / 1000));
      throw new AppError(429, 'EXPORT_DAILY_LIMIT', 'Limite de uma exportação por dia', { detail: 'Você pode pedir uma por dia. Tente de novo amanhã.', retryAfterSeconds: retry });
    }
    try {
      const [row] = await this.db.insert(dataExports).values({ userId: principal.userId }).returning();
      if (!row) throw new Error('Falha ao registrar a exportação');
      await this.audit.record(this.db, ctx, { action: 'privacy.export_requested', targetType: 'user', targetId: principal.userId, actorId: principal.userId, actorRole: 'customer' });
      return present(row);
    } catch (error) {
      // Duplo toque: o índice único parcial deixa passar só uma em andamento.
      if (isUniqueViolation(error)) throw errors.conflict('EXPORT_IN_PROGRESS', 'Você já tem uma exportação em andamento', 'Avisamos por e-mail quando ela ficar pronta.');
      throw error;
    }
  }

  /** Cartão de status da tela (CC3): a última exportação e quando dá para pedir outra. */
  async latest(userId: string): Promise<{ latest: ExportStatusView | null; nextRequestAt: string | null }> {
    const [row] = await this.db.select().from(dataExports).where(eq(dataExports.userId, userId)).orderBy(desc(dataExports.requestedAt)).limit(1);
    if (!row) return { latest: null, nextRequestAt: null };
    const view = row.status === 'ready' && row.expiresAt && row.expiresAt <= new Date() ? { ...present(row), status: 'expired' as const } : present(row);
    const next = new Date(row.requestedAt.getTime() + 86_400_000);
    return { latest: view, nextRequestAt: next > new Date() ? next.toISOString() : null };
  }

  /** Link de uso único (5 min). Só o dono e só enquanto o arquivo vale; outro usuário ou id inexistente: 404 (SEC-020). */
  async createDownloadLink(userId: string, exportId: string): Promise<{ url: string; expiresAt: string }> {
    const [row] = await this.db.select().from(dataExports).where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)));
    if (!row) throw errors.notFound('Exportação não encontrada.');
    if (row.status !== 'ready' || !row.expiresAt || row.expiresAt <= new Date()) {
      throw errors.gone('EXPORT_NOT_AVAILABLE', 'Exportação indisponível', row.status === 'ready' || row.status === 'expired' ? 'O arquivo venceu. Peça outro.' : 'O arquivo ainda não ficou pronto.');
    }
    const minutes = await this.params.getNumber('exportacao_link_min');
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    await this.db.insert(dataExportLinks).values({ exportId, tokenHash: sha256Hex(token), expiresAt });
    return { url: `/v1/data-exports/download/${token}`, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Resgate do link (público: o token é a credencial). O uso é consumido ANTES de ler o arquivo (duas requisições simultâneas:
   * só uma vence). Qualquer falha (inexistente, usado, vencido, arquivo vencido) responde 410 com a mesma mensagem.
   */
  async redeem(token: string): Promise<{ body: Buffer; fileName: string }> {
    const gone = () => errors.gone('EXPORT_LINK_INVALID', 'Link inválido ou já usado', 'Peça um novo link no app.');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw gone();
    const [link] = await this.db
      .update(dataExportLinks)
      .set({ usedAt: new Date() })
      .where(and(eq(dataExportLinks.tokenHash, sha256Hex(token)), isNull(dataExportLinks.usedAt), gt(dataExportLinks.expiresAt, new Date())))
      .returning();
    if (!link) throw gone();
    const [file] = await this.db.select().from(dataExports).where(eq(dataExports.id, link.exportId));
    if (file?.status !== 'ready' || !file.objectKey || !file.expiresAt || file.expiresAt <= new Date()) throw gone();
    const body = await this.storage.getObject('private', file.objectKey, { maxBytes: MAX_EXPORT_BYTES });
    if (!body) throw gone();
    await this.db.update(dataExports).set({ downloadCount: sql`${dataExports.downloadCount} + 1` }).where(eq(dataExports.id, file.id));
    await this.audit.record(this.db, SYSTEM_CTX, { action: 'privacy.export_downloaded', targetType: 'user', targetId: file.userId, actorId: file.userId, actorRole: 'customer' });
    return { body, fileName: `webag-meus-dados-${file.readyAt?.toISOString().slice(0, 10) ?? 'arquivo'}.json` };
  }

  // -------------------------------------------------------------------- fila

  /** Varredura: monta as exportações pedidas e apaga as vencidas. Idempotente; `SKIP LOCKED` permite mais de uma instância. */
  async processQueue(now = new Date()): Promise<{ built: number; failed: number; expired: number }> {
    const totals = { built: 0, failed: 0, expired: 0 };
    for (;;) {
      const [claimed] = await this.db.execute<{ id: string; user_id: string }>(
        sql`update data_exports set status = 'processing', started_at = ${now.toISOString()}::timestamptz
            where id = (select id from data_exports where status = 'queued' order by requested_at for update skip locked limit 1)
            returning id, user_id`,
      ).then((r) => r.rows);
      if (!claimed) break;
      try {
        await this.build(claimed.id, claimed.user_id, now);
        totals.built += 1;
      } catch (error) {
        totals.failed += 1;
        const message = safeErrorMessage(error).slice(0, 300);
        this.logger.error(`exportação falhou (${claimed.id}): ${message}`);
        const [row] = await this.db.select({ failures: dataExports.failures }).from(dataExports).where(eq(dataExports.id, claimed.id));
        const failures = (row?.failures ?? 0) + 1;
        // Tenta de novo no ciclo seguinte até MAX_FAILURES; depois fica `failed` (o titular pode pedir outra).
        await this.db.update(dataExports).set({ status: failures >= MAX_FAILURES ? 'failed' : 'queued', failures, lastError: message }).where(eq(dataExports.id, claimed.id));
        if (failures < MAX_FAILURES) break; // não gira em falso no mesmo ciclo
      }
    }
    totals.expired = await this.expireDue(now);
    return totals;
  }

  private async expireDue(now: Date): Promise<number> {
    const due = await this.db.select().from(dataExports).where(and(eq(dataExports.status, 'ready'), lte(dataExports.expiresAt, now))).limit(100);
    for (const row of due) {
      if (row.objectKey) await this.storage.deleteObject('private', row.objectKey);
      await this.db.update(dataExports).set({ status: 'expired', objectKey: null }).where(eq(dataExports.id, row.id));
    }
    return due.length;
  }

  private async build(exportId: string, userId: string, now: Date): Promise<void> {
    const document = await this.collect(userId, now);
    const body = Buffer.from(JSON.stringify(document, null, 2), 'utf8');
    if (body.length > MAX_EXPORT_BYTES) throw new Error('arquivo acima do limite');
    const key = `exports/${userId}/${exportId}.json`;
    await this.storage.putObject('private', key, body, 'application/json');
    const validityDays = await this.params.getNumber('exportacao_validade_dias');
    const expiresAt = new Date(now.getTime() + validityDays * 86_400_000);
    const [updated] = await this.db
      .update(dataExports)
      .set({ status: 'ready', readyAt: now, expiresAt, objectKey: key, sizeBytes: body.length, lastError: null })
      .where(and(eq(dataExports.id, exportId), eq(dataExports.status, 'processing')))
      .returning({ id: dataExports.id });
    if (!updated) {
      await this.storage.deleteObject('private', key); // a conta foi excluída no meio: não deixa arquivo órfão
      return;
    }
    const [user] = await this.db.select({ email: t.users.email, status: t.users.status }).from(t.users).where(eq(t.users.id, userId));
    if (user?.status === 'active') this.mail.enqueue({ to: user.email, ...dataExportReadyEmail(expiresAt) });
    await this.audit.record(this.db, SYSTEM_CTX, { action: 'privacy.export_ready', targetType: 'user', targetId: userId, after: { sizeBytes: body.length }, actorId: null, actorRole: 'system' });
  }

  /** Monta o documento. Só colunas do titular; nada de hash, token, segredo ou dado de terceiros. */
  async collect(userId: string, now = new Date()): Promise<Record<string, unknown>> {
    const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
    const [user] = await this.db.select().from(t.users).where(eq(t.users.id, userId));
    if (!user) throw new Error('usuário inexistente');
    const roles = await this.db.select({ role: t.userRoles.role }).from(t.userRoles).where(eq(t.userRoles.userId, userId));

    const addresses = await this.db.select().from(t.userAddresses).where(eq(t.userAddresses.userId, userId)).orderBy(asc(t.userAddresses.createdAt)).limit(MAX_ROWS);
    const orderRows = await this.db
      .select({ order: t.orders, storeName: t.stores.name })
      .from(t.orders)
      .innerJoin(t.stores, eq(t.stores.id, t.orders.storeId))
      .where(eq(t.orders.userId, userId))
      .orderBy(desc(t.orders.createdAt))
      .limit(MAX_ROWS);
    const items = orderRows.length === 0 ? [] : await this.db.select().from(t.orderItems).where(inArray(t.orderItems.orderId, orderRows.map((r) => r.order.id)));
    const exchanges = await this.db.select().from(t.exchangeRequests).where(eq(t.exchangeRequests.userId, userId)).orderBy(desc(t.exchangeRequests.createdAt)).limit(MAX_ROWS);
    const reviewRows = await this.db.select({ r: t.reviews, storeName: t.stores.name }).from(t.reviews).innerJoin(t.stores, eq(t.stores.id, t.reviews.storeId)).where(eq(t.reviews.userId, userId)).limit(MAX_ROWS);
    const favoriteRows = await this.db
      .select({ f: t.favorites, storeName: t.stores.name, productName: t.products.name })
      .from(t.favorites)
      .leftJoin(t.stores, eq(t.stores.id, t.favorites.storeId))
      .leftJoin(t.products, eq(t.products.id, t.favorites.productId))
      .where(eq(t.favorites.userId, userId))
      .limit(MAX_ROWS);
    const searches = await this.db.select().from(t.searchHistory).where(eq(t.searchHistory.userId, userId)).orderBy(desc(t.searchHistory.searchedAt)).limit(100);
    const consentRows = await this.db.select().from(t.consents).where(eq(t.consents.userId, userId)).orderBy(asc(t.consents.createdAt));
    const acceptances = await this.db
      .select({ a: t.termsAcceptances, type: t.legalDocuments.type, version: t.legalDocuments.version })
      .from(t.termsAcceptances)
      .innerJoin(t.legalDocuments, eq(t.legalDocuments.id, t.termsAcceptances.documentId))
      .where(eq(t.termsAcceptances.userId, userId))
      .orderBy(asc(t.termsAcceptances.acceptedAt));
    const devices = await this.db.select().from(t.pushDevices).where(eq(t.pushDevices.userId, userId));
    const sessionRows = await this.db.select().from(t.sessions).where(eq(t.sessions.userId, userId)).orderBy(desc(t.sessions.createdAt)).limit(50);
    const redemptions = await this.db.select({ r: t.couponRedemptions, code: t.coupons.code }).from(t.couponRedemptions).innerJoin(t.coupons, eq(t.coupons.id, t.couponRedemptions.couponId)).where(eq(t.couponRedemptions.userId, userId)).limit(MAX_ROWS);
    const requests = await this.db.select().from(t.privacyRequests).where(eq(t.privacyRequests.userId, userId)).orderBy(asc(t.privacyRequests.receivedAt));

    // Lojista (WB-212 C6): perfil da loja e pedidos com valores. O comprador (terceiro) NÃO entra.
    const [store] = await this.db.select().from(t.stores).where(eq(t.stores.ownerUserId, userId));
    let merchant: Record<string, unknown> | null = null;
    if (store) {
      const storeOrders = await this.db.select().from(t.orders).where(eq(t.orders.storeId, store.id)).orderBy(desc(t.orders.createdAt)).limit(MAX_ROWS);
      merchant = {
        store: {
          id: store.id, name: store.name, status: store.status, description: store.description, documentType: store.documentType, documentNumber: store.documentNumber, legalName: store.legalName,
          phone: store.phone, whatsapp: store.whatsapp, address: { cep: store.addressCep, street: store.addressStreet, number: store.addressNumber, complement: store.addressComplement, neighborhood: store.addressNeighborhood, city: store.addressCityName, state: store.addressState },
          createdAt: iso(store.createdAt), approvedAt: iso(store.approvedAt),
        },
        orders: storeOrders.map((o) => ({ number: o.number, status: o.status, mode: o.mode, subtotalCents: o.subtotalCents, deliveryFeeCents: o.deliveryFeeCents, discountCents: o.discountCents, totalCents: o.totalCents, commissionCents: o.commissionCents, createdAt: iso(o.createdAt), deliveredAt: iso(o.deliveredAt) })),
      };
    }

    return {
      generatedAt: now.toISOString(),
      about: 'Cópia dos seus dados no Webag. Não inclui senhas, tokens nem dados de outras pessoas.',
      profile: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerifiedAt !== null, phone: user.phone, roles: roles.map((r) => r.role), createdAt: iso(user.createdAt), adultDeclaredAt: iso(user.adultDeclaredAt), lastLoginAt: iso(user.lastLoginAt) },
      addresses: addresses.map((a) => ({ label: a.label, cep: a.cep, street: a.street, number: a.number, complement: a.complement, neighborhood: a.neighborhood, city: a.cityName, state: a.state, lat: a.lat, lng: a.lng, isDefault: a.isDefault, createdAt: iso(a.createdAt) })),
      orders: orderRows.map(({ order: o, storeName }) => ({
        number: o.number, store: storeName, status: o.status, mode: o.mode, paymentMethod: o.paymentMethod, address: o.address, couponCode: o.couponCode,
        subtotalCents: o.subtotalCents, deliveryFeeCents: o.deliveryFeeCents, serviceFeeCents: o.serviceFeeCents, discountCents: o.discountCents, totalCents: o.totalCents,
        createdAt: iso(o.createdAt), paidAt: iso(o.paidAt), deliveredAt: iso(o.deliveredAt), cancelledAt: iso(o.cancelledAt), cancelReason: o.cancelReason,
        items: items.filter((i) => i.orderId === o.id).map((i) => ({ name: i.name, attributes: i.attributes, quantity: i.quantity, unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents })),
      })),
      exchanges: exchanges.map((e) => ({ number: e.number, type: e.type, reasonCode: e.reasonCode, description: e.description, resolution: e.resolution, method: e.method, status: e.status, feeCents: e.feeCents, differenceCents: e.differenceCents, refundCents: e.refundCents, photoCount: e.photoIds.length, createdAt: iso(e.createdAt), decidedAt: iso(e.decidedAt), completedAt: iso(e.completedAt) })),
      reviews: reviewRows.map(({ r, storeName }) => ({ store: storeName, rating: r.rating, comment: r.comment, fit: r.fit, status: r.status, createdAt: iso(r.createdAt) })),
      favorites: favoriteRows.map(({ f, storeName, productName }) => ({ kind: f.storeId ? 'store' : 'product', name: storeName ?? productName, createdAt: iso(f.createdAt) })),
      searchHistory: searches.map((s) => ({ term: s.term, at: iso(s.searchedAt) })),
      consents: consentRows.map((c) => ({ purpose: c.purpose, granted: c.granted, textVersion: c.textVersion, channel: c.channel, at: iso(c.createdAt) })),
      termsAcceptances: acceptances.map((a) => ({ document: a.type, version: a.version, acceptedAt: iso(a.a.acceptedAt), ip: a.a.ip, platform: a.a.platform })),
      pushDevices: devices.map((d) => ({ platform: d.platform, registeredAt: iso(d.createdAt), lastSeenAt: iso(d.lastSeenAt) })),
      sessions: sessionRows.map((s) => ({ createdAt: iso(s.createdAt), lastUsedAt: iso(s.lastUsedAt), userAgent: s.userAgent, ip: s.ip, revoked: s.revokedAt !== null })),
      couponRedemptions: redemptions.map(({ r, code }) => ({ code, discountCents: r.discountCents, at: iso(r.createdAt) })),
      privacyRequests: requests.map((r) => ({ protocol: r.protocol, type: r.type, status: r.status, receivedAt: iso(r.receivedAt), answeredAt: iso(r.answeredAt), answer: r.answer })),
      ...(merchant ? { merchant } : {}),
    };
  }
}
