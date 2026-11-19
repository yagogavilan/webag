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
var NotificationsService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { memberHasStorePermission } from '../../platform/auth/permissions.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { ExchangeEventBus } from '../exchanges/index.js';
import { storeMembers, users } from '../identity/db/schema.js';
import { OrderEventBus } from '../orders/index.js';
import { stores } from '../stores/db/schema.js';
import { pushDevices } from './db/schema.js';
import { customerExchangeNotice, customerOrderNotice, storeExchangeNotice, storeExchangeReminderNotice, storeOrderNotice } from './domain/catalog.js';
import { PushTransport } from './push.transport.js';
/**
 * Notificações transacionais (RF-NOT-02/03/04): assina os barramentos de pedido e de troca (eventos que já saem DEPOIS do commit) e
 * envia push (Expo) e e-mail pelo catálogo. Falha de canal nunca desfaz nem atrasa o pedido: o cliente sempre recupera o estado pelo REST.
 */
let NotificationsService = NotificationsService_1 = class NotificationsService {
    db;
    push;
    mail;
    orderBus;
    exchangeBus;
    logger = new Logger(NotificationsService_1.name);
    constructor(db, push, mail, orderBus, exchangeBus) {
        this.db = db;
        this.push = push;
        this.mail = mail;
        this.orderBus = orderBus;
        this.exchangeBus = exchangeBus;
    }
    onModuleInit() {
        this.orderBus.subscribe((event) => this.onOrder(event));
        this.exchangeBus.subscribe((event) => this.onExchange(event));
        this.exchangeBus.subscribeReminder((reminder) => this.onExchangeReminder(reminder));
    }
    async onOrder(e) {
        const [store] = await this.db.select({ name: stores.name }).from(stores).where(eq(stores.id, e.storeId));
        await this.deliver([e.userId], customerOrderNotice(e, store?.name ?? 'A loja'));
        const notice = e.notice && e.notice !== 'accept_reminder' ? null : storeOrderNotice(e); // atraso e compensação são só do cliente; o lembrete de aceite é só da loja
        if (notice)
            await this.deliver(await this.storeUserIds(e.storeId), notice);
    }
    /** DT-050: lembrete à loja 12 h e 4 h antes de a troca ser aprovada sozinha (só a loja; o cliente não recebe). */
    async onExchangeReminder(r) {
        await this.deliver(await this.storeUserIds(r.storeId, 'exchanges'), storeExchangeReminderNotice(r));
    }
    async onExchange(e) {
        await this.deliver([e.userId], customerExchangeNotice(e));
        if (e.notice)
            return; // aviso avulso ao cliente (coleta atrasada): a loja não recebe a notificação de mudança de estado
        const notice = storeExchangeNotice(e);
        if (notice)
            await this.deliver(await this.storeUserIds(e.storeId, 'exchanges'), notice);
    }
    /** Membros da loja que podem agir no assunto (dono sempre; funcionário só com a permissão). */
    async storeUserIds(storeId, permission = 'orders') {
        const members = await this.db.select().from(storeMembers).where(eq(storeMembers.storeId, storeId));
        return members.filter((m) => memberHasStorePermission(m, permission)).map((m) => m.userId);
    }
    async deliver(userIds, notice) {
        if (!notice || userIds.length === 0)
            return;
        if (notice.push)
            await this.sendPush(userIds, notice.push).catch((error) => this.logger.warn(`push falhou: ${safeErrorMessage(error)}`));
        if (notice.email) {
            const recipients = await this.db.select({ email: users.email }).from(users).where(and(inArray(users.id, userIds), eq(users.status, 'active')));
            for (const r of recipients)
                this.mail.enqueue({ to: r.email, subject: notice.email.subject, text: notice.email.text });
        }
    }
    async sendPush(userIds, push) {
        const devices = await this.db.select().from(pushDevices).where(and(inArray(pushDevices.userId, userIds), isNull(pushDevices.disabledAt)));
        if (devices.length === 0)
            return;
        const results = await this.push.send(devices.map((d) => ({ to: d.token, title: push.title, body: push.body, data: push.data })));
        const dead = devices.filter((_, i) => results[i]?.invalidToken).map((d) => d.id);
        if (dead.length > 0)
            await this.db.update(pushDevices).set({ disabledAt: new Date() }).where(inArray(pushDevices.id, dead));
    }
    // ------------------------------------------------------------------ aparelhos
    /** O token é do aparelho: quem entra nele assume o token (o dono anterior deixa de receber). Idempotente. */
    async registerDevice(userId, input) {
        await this.db
            .insert(pushDevices)
            .values({ userId, token: input.token, platform: input.platform })
            .onConflictDoUpdate({ target: pushDevices.token, set: { userId, platform: input.platform, lastSeenAt: new Date(), disabledAt: null } });
    }
    /** Logout ou "desligar notificações": só o dono do token consegue revogá-lo. */
    async revokeDevice(userId, token) {
        await this.db.delete(pushDevices).where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
    }
};
NotificationsService = NotificationsService_1 = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, PushTransport,
        MailService,
        OrderEventBus,
        ExchangeEventBus])
], NotificationsService);
export { NotificationsService };
//# sourceMappingURL=notifications.service.js.map