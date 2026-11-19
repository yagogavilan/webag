import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { memberHasStorePermission } from '../../platform/auth/permissions.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { ExchangeEventBus, type ExchangeEvent, type ExchangeReminder } from '../exchanges/index.js';
import { storeMembers, users } from '../identity/db/schema.js';
import { OrderEventBus, type OrderEvent } from '../orders/index.js';
import { orderItems, orders } from '../orders/db/schema.js';
import { stores, storeSettings } from '../stores/db/schema.js';
import { pushDevices } from './db/schema.js';
import { customerExchangeNotice, customerOrderNotice, storeExchangeNotice, storeExchangeReminderNotice, storeOrderEmail, storeOrderNotice, type Notice } from './domain/catalog.js';
import { PushTransport } from './push.transport.js';

/**
 * Notificações transacionais (RF-NOT-02/03/04): assina os barramentos de pedido e de troca (eventos que já saem DEPOIS do commit) e
 * envia push (Expo) e e-mail pelo catálogo. Falha de canal nunca desfaz nem atrasa o pedido: o cliente sempre recupera o estado pelo REST.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly push: PushTransport,
    private readonly mail: MailService,
    private readonly orderBus: OrderEventBus,
    private readonly exchangeBus: ExchangeEventBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.orderBus.subscribe((event) => this.onOrder(event));
    this.exchangeBus.subscribe((event) => this.onExchange(event));
    this.exchangeBus.subscribeReminder((reminder) => this.onExchangeReminder(reminder));
  }

  private async onOrder(e: OrderEvent): Promise<void> {
    const [store] = await this.db.select({ name: stores.name }).from(stores).where(eq(stores.id, e.storeId));
    await this.deliver([e.userId], customerOrderNotice(e, store?.name ?? 'A loja'));
    const notice = e.notice && e.notice !== 'accept_reminder' ? null : storeOrderNotice(e); // atraso e compensação são só do cliente; o lembrete de aceite é só da loja
    if (notice) await this.deliver(await this.storeUserIds(e.storeId), notice);
    await this.emailStoreAboutOrder(e, store?.name ?? 'sua loja');
  }

  /**
   * B2 / WB-192 C2 e C3: e-mail ao dono e à equipe (permissão `orders`) do pedido novo pago e do lembrete de aceite (o lembrete é o aviso
   * "Aceite agora", antes do cancelamento por `loja_aceite_timeout_min`). Dedupe: o aviso de pedido novo é reivindicado de forma atômica
   * (`orders.store_notified_at`) e o lembrete já é reivindicado uma vez por pedido na varredura (`accept_reminded_at`). Respeita o liga/desliga
   * da loja. O pedido só entra se ainda estiver em `received` (aceito ou cancelado entre o evento e o envio não gera e-mail).
   */
  private async emailStoreAboutOrder(e: OrderEvent, storeName: string): Promise<void> {
    const kind = e.notice === 'accept_reminder' ? 'reminder' : e.notice === undefined && e.from === 'awaiting_payment' && e.to === 'received' ? 'new' : null;
    if (!kind) return;
    const [settings] = await this.db.select({ on: storeSettings.notifyNewOrderEmail }).from(storeSettings).where(eq(storeSettings.storeId, e.storeId));
    if (settings && !settings.on) return;
    if (kind === 'new') {
      const [claimed] = await this.db.update(orders).set({ storeNotifiedAt: new Date() }).where(and(eq(orders.id, e.orderId), isNull(orders.storeNotifiedAt))).returning({ id: orders.id });
      if (!claimed) return;
    }
    const [order] = await this.db.select().from(orders).where(eq(orders.id, e.orderId));
    if (!order || order.status !== 'received' || !order.acceptDeadlineAt) return;
    const items = await this.db.select({ quantity: orderItems.quantity, name: orderItems.name, attributes: orderItems.attributes }).from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.createdAt, orderItems.id);
    const userIds = await this.storeUserIds(e.storeId);
    if (userIds.length === 0) return;
    const panelUrl = `${this.config.get('ADMIN_WEB_URL', { infer: true }).replace(/\/$/, '')}/lojista/pedidos/${order.id}`;
    const email = storeOrderEmail({ kind, number: order.number, mode: order.mode, storeName, items, acceptBy: order.acceptDeadlineAt, now: new Date(), panelUrl });
    await this.deliver(userIds, { email });
  }

  /** DT-050: lembrete à loja 12 h e 4 h antes de a troca ser aprovada sozinha (só a loja; o cliente não recebe). */
  private async onExchangeReminder(r: ExchangeReminder): Promise<void> {
    await this.deliver(await this.storeUserIds(r.storeId, 'exchanges'), storeExchangeReminderNotice(r));
  }

  private async onExchange(e: ExchangeEvent): Promise<void> {
    await this.deliver([e.userId], customerExchangeNotice(e));
    if (e.notice) return; // aviso avulso ao cliente (coleta atrasada): a loja não recebe a notificação de mudança de estado
    const notice = storeExchangeNotice(e);
    if (notice) await this.deliver(await this.storeUserIds(e.storeId, 'exchanges'), notice);
  }

  /** Membros da loja que podem agir no assunto (dono sempre; funcionário só com a permissão). */
  private async storeUserIds(storeId: string, permission: 'orders' | 'exchanges' = 'orders'): Promise<string[]> {
    const members = await this.db.select().from(storeMembers).where(eq(storeMembers.storeId, storeId));
    return members.filter((m) => memberHasStorePermission(m, permission)).map((m) => m.userId);
  }

  private async deliver(userIds: string[], notice: Notice | null): Promise<void> {
    if (!notice || userIds.length === 0) return;
    if (notice.push) await this.sendPush(userIds, notice.push).catch((error) => this.logger.warn(`push falhou: ${safeErrorMessage(error)}`));
    if (notice.email) {
      const recipients = await this.db.select({ email: users.email }).from(users).where(and(inArray(users.id, userIds), eq(users.status, 'active')));
      for (const r of recipients) this.mail.enqueue({ to: r.email, subject: notice.email.subject, text: notice.email.text });
    }
  }

  private async sendPush(userIds: string[], push: NonNullable<Notice['push']>): Promise<void> {
    const devices = await this.db.select().from(pushDevices).where(and(inArray(pushDevices.userId, userIds), isNull(pushDevices.disabledAt)));
    if (devices.length === 0) return;
    const results = await this.push.send(devices.map((d) => ({ to: d.token, title: push.title, body: push.body, data: push.data })));
    const dead = devices.filter((_, i) => results[i]?.invalidToken).map((d) => d.id);
    if (dead.length > 0) await this.db.update(pushDevices).set({ disabledAt: new Date() }).where(inArray(pushDevices.id, dead));
  }

  // ------------------------------------------------------------------ aparelhos

  /** O token é do aparelho: quem entra nele assume o token (o dono anterior deixa de receber). Idempotente. */
  async registerDevice(userId: string, input: { token: string; platform: 'android' | 'ios' }): Promise<void> {
    await this.db
      .insert(pushDevices)
      .values({ userId, token: input.token, platform: input.platform })
      .onConflictDoUpdate({ target: pushDevices.token, set: { userId, platform: input.platform, lastSeenAt: new Date(), disabledAt: null } });
  }

  /** Logout ou "desligar notificações": só o dono do token consegue revogá-lo. */
  async revokeDevice(userId: string, token: string): Promise<void> {
    await this.db.delete(pushDevices).where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
  }
}
