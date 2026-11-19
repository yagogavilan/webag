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
var PushCampaignsService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { PushTransport } from '../notifications/index.js';
import { nextWindowStart } from './domain/window.js';
import { pushCampaignRecipients, pushCampaigns } from './db/schema.js';
const SYSTEM_CTX = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
const MAX_SEND_ATTEMPTS = 3;
const MAX_AUDIENCE = 50_000;
/**
 * WB-197: push de marketing segmentado. Quem recebe: cliente ATIVO, com o consentimento `marketing_push` vigente (o último evento é a
 * concessão), com aparelho ativo, que não atingiu `push_mkt_max_semana` nos últimos 7 dias, dentro do segmento. Segmento menor que
 * `push_mkt_min_segmento` é recusado (proteção contra reidentificação) e a contagem exata abaixo do mínimo nem é devolvida.
 * O público é RECALCULADO no envio; fora da janela `push_mkt_janela` o envio vai para o próximo início; a flag `push_marketing`
 * desligada bloqueia tudo, qualquer que seja a preferência (WB-196 C5).
 */
let PushCampaignsService = PushCampaignsService_1 = class PushCampaignsService {
    db;
    params;
    flags;
    audit;
    push;
    logger = new Logger(PushCampaignsService_1.name);
    timers = [];
    constructor(db, params, flags, audit, push) {
        this.db = db;
        this.params = params;
        this.flags = flags;
        this.audit = audit;
        this.push = push;
    }
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1')
            return;
        this.timers.push(setInterval(() => void this.processDue().catch((e) => this.logger.error(e.message)), 60_000).unref());
    }
    onApplicationShutdown() {
        this.timers.forEach(clearInterval);
    }
    // ------------------------------------------------------------------ público
    segmentSql(segment) {
        switch (segment.kind) {
            case 'city':
                return sql `exists (select 1 from user_addresses a where a.user_id = u.id and a.city_id = ${segment.cityId}::uuid)`;
            case 'neighborhood':
                return sql `exists (select 1 from user_addresses a where a.user_id = u.id and a.neighborhood_id = ${segment.neighborhoodId}::uuid)`;
            case 'inactive':
                // "Sem comprar há N dias": já comprou (pedido pago) e o último pagamento é mais velho que N dias.
                return sql `exists (select 1 from orders o where o.user_id = u.id and o.paid_at is not null)
          and not exists (select 1 from orders o where o.user_id = u.id and o.paid_at > now() - make_interval(days => ${segment.days}::int))`;
            case 'bought_category':
                return sql `exists (select 1 from orders o join order_items oi on oi.order_id = o.id join categories c on c.id = oi.category_id
          where o.user_id = u.id and o.paid_at is not null and (c.id = ${segment.categoryId}::uuid or c.parent_id = ${segment.categoryId}::uuid))`;
            case 'new_customers':
                return sql `u.created_at > now() - make_interval(days => ${segment.days}::int)`;
        }
    }
    /** CTE com os elegíveis antes do limite semanal. */
    baseSql(segment) {
        return sql `select u.id from users u
      where u.status = 'active'
        and exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'customer')
        and not exists (select 1 from admin_profiles ap where ap.user_id = u.id)
        and exists (select 1 from push_devices d where d.user_id = u.id and d.disabled_at is null)
        and coalesce((select c.granted from consents c where c.user_id = u.id and c.purpose = 'marketing_push' order by c.created_at desc, c.id desc limit 1), false)
        and ${this.segmentSql(segment)}`;
    }
    async audience(segment) {
        const cap = await this.params.getNumber('push_mkt_max_semana');
        const res = await this.db.execute(sql `
      with base as (${this.baseSql(segment)}),
      recent as (select b.id, (select count(*) from push_campaign_recipients r where r.user_id = b.id and r.sent_at > now() - interval '7 days') as n from base b)
      select count(*)::int as opted, count(*) filter (where n >= ${cap}::int)::int as capped from recent`);
        const row = res.rows[0] ?? { opted: 0, capped: 0 };
        return { optedIn: row.opted, excludedByCap: row.capped, eligible: row.opted - row.capped };
    }
    async recipients(segment, campaignId) {
        const cap = await this.params.getNumber('push_mkt_max_semana');
        const res = await this.db.execute(sql `
      with base as (${this.baseSql(segment)})
      select b.id from base b
      where (select count(*) from push_campaign_recipients r where r.user_id = b.id and r.sent_at > now() - interval '7 days') < ${cap}::int
        and not exists (select 1 from push_campaign_recipients r where r.user_id = b.id and r.campaign_id = ${campaignId}::uuid)
      limit ${MAX_AUDIENCE}`);
        return res.rows.map((r) => r.id);
    }
    /** Estimativa da tela "Quem recebe". Abaixo do mínimo a contagem exata NÃO sai (só `belowMinimum` e o mínimo). */
    async estimate(segment) {
        await this.assertSegmentTargets(segment);
        const [audience, min, window] = await Promise.all([this.audience(segment), this.params.getNumber('push_mkt_min_segmento'), this.params.get('push_mkt_janela').then(String)]);
        const below = audience.eligible < min;
        const sendAt = nextWindowStart(new Date(), window);
        return {
            eligible: below ? null : audience.eligible,
            excludedByCap: below ? null : audience.excludedByCap,
            belowMinimum: below,
            minimum: min,
            marketingEnabled: await this.flags.isEnabled('push_marketing'),
            /** Quando sairia se enviasse agora (fora da janela vira o próximo início). */
            nextSendAt: sendAt.toISOString(),
        };
    }
    async assertSegmentTargets(segment) {
        const check = async (table, id, field) => {
            const found = await this.db.execute(sql `select 1 from ${sql.identifier(table)} where id = ${id}::uuid`);
            if (found.rowCount === 0)
                throw errors.validation([{ field, message: 'Item não encontrado.' }]);
        };
        if (segment.kind === 'city')
            await check('cities', segment.cityId, 'segment.cityId');
        if (segment.kind === 'neighborhood')
            await check('neighborhoods', segment.neighborhoodId, 'segment.neighborhoodId');
        if (segment.kind === 'bought_category')
            await check('categories', segment.categoryId, 'segment.categoryId');
    }
    async assertDestination(destination) {
        if (destination.type === 'store') {
            const [row] = await this.db.select({ status: t.stores.status }).from(t.stores).where(eq(t.stores.id, destination.id));
            if (row?.status !== 'approved')
                throw errors.validation([{ field: 'destination.id', message: 'A loja precisa estar ativa.' }]);
        }
        else if (destination.type === 'category') {
            const [row] = await this.db.select({ id: t.categories.id }).from(t.categories).where(eq(t.categories.id, destination.id));
            if (!row)
                throw errors.validation([{ field: 'destination.id', message: 'Categoria não encontrada.' }]);
        }
        else if (destination.type === 'coupon') {
            const [row] = await this.db.select({ active: t.coupons.active, endsAt: t.coupons.endsAt }).from(t.coupons).where(eq(sql `upper(${t.coupons.code})`, destination.code.toUpperCase()));
            if (!row?.active || row.endsAt <= new Date())
                throw errors.validation([{ field: 'destination.code', message: 'O cupom precisa estar ativo.' }]);
        }
    }
    // ------------------------------------------------------------------ campanha
    present(row, opened = 0, unsubscribed = 0) {
        return {
            id: row.id,
            title: row.title,
            body: row.body,
            destination: row.destination,
            segment: row.segment,
            status: row.status,
            sendAt: row.sendAt.toISOString(),
            sentAt: row.sentAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
            estimated: row.estimatedCount,
            sent: row.recipientsCount,
            delivered: row.deliveredCount,
            opened,
            unsubscribed,
            excludedByCap: row.excludedByCapCount,
            cancelReason: row.cancelReason,
        };
    }
    /** Abertos (o app avisa ao tocar) e descadastros (revogou o marketing em até 48 h do envio). */
    async metrics(ids) {
        const map = new Map();
        if (ids.length === 0)
            return map;
        const res = await this.db.execute(sql `
      select r.campaign_id, count(*) filter (where r.opened_at is not null)::int as opened,
        count(*) filter (where exists (select 1 from consents c where c.user_id = r.user_id and c.purpose = 'marketing_push' and c.granted = false
          and c.created_at > r.sent_at and c.created_at < r.sent_at + interval '48 hours'))::int as unsub
      from push_campaign_recipients r where r.campaign_id in (${sql.join(ids.map((id) => sql `${id}::uuid`), sql `, `)}) group by r.campaign_id`);
        for (const row of res.rows)
            map.set(row.campaign_id, { opened: row.opened, unsubscribed: row.unsub });
        return map;
    }
    async create(ctx, input) {
        if (!(await this.flags.isEnabled('push_marketing')))
            throw errors.conflict('PUSH_MARKETING_DISABLED', 'O push de marketing está desligado', 'Nada será enviado enquanto a flag estiver desligada.');
        if ((await this.params.getNumber('push_mkt_max_semana')) === 0)
            throw errors.conflict('PUSH_MARKETING_DISABLED', 'O push de marketing está desligado', 'O limite semanal está em zero.');
        await this.assertSegmentTargets(input.segment);
        await this.assertDestination(input.destination);
        const now = new Date();
        if (input.scheduleAt && (input.scheduleAt.getTime() <= now.getTime() || input.scheduleAt.getTime() > now.getTime() + 30 * 86_400_000)) {
            throw errors.validation([{ field: 'scheduleAt', message: 'Agende para um horário futuro, em até 30 dias.' }]);
        }
        const [audience, min, window] = await Promise.all([this.audience(input.segment), this.params.getNumber('push_mkt_min_segmento'), this.params.get('push_mkt_janela').then(String)]);
        if (audience.eligible < min)
            throw errors.unprocessable('SEGMENT_TOO_SMALL', 'Segmento pequeno demais', { detail: `Segmentos com menos de ${min} pessoas podem identificar alguém. Escolha um maior.` });
        // C5: "Enviar para N pessoas?" - o N confirmado é o de agora; mudou, a tela confirma de novo.
        if (audience.eligible !== input.expectedRecipients) {
            throw errors.conflict('ESTIMATE_CHANGED', 'A estimativa mudou', 'O número de destinatários mudou. Confira e confirme de novo.', { eligible: audience.eligible });
        }
        const sendAt = nextWindowStart(input.scheduleAt ?? now, window);
        return this.db.transaction(async (tx) => {
            const [row] = await tx
                .insert(pushCampaigns)
                .values({ title: input.title, body: input.body, destination: input.destination, segment: input.segment, sendAt, estimatedCount: audience.eligible, excludedByCapCount: audience.excludedByCap, createdBy: ctx.principal?.userId ?? null })
                .returning();
            if (!row)
                throw new Error('Falha ao criar a campanha');
            await this.audit.record(tx, ctx, { action: 'push_campaign.created', targetType: 'push_campaign', targetId: row.id, after: { segment: input.segment, destination: input.destination, estimated: audience.eligible, sendAt: sendAt.toISOString() } });
            return this.present(row);
        });
    }
    async cancel(ctx, id, reason) {
        return this.db.transaction(async (tx) => {
            const [row] = await tx.update(pushCampaigns).set({ status: 'cancelled', cancelReason: reason }).where(and(eq(pushCampaigns.id, id), eq(pushCampaigns.status, 'scheduled'))).returning();
            if (!row) {
                const [existing] = await tx.select({ status: pushCampaigns.status }).from(pushCampaigns).where(eq(pushCampaigns.id, id));
                if (!existing)
                    throw errors.notFound('Campanha não encontrada.');
                throw errors.conflict('CAMPAIGN_NOT_CANCELLABLE', 'A campanha não pode mais ser cancelada', 'Depois do envio não dá para desfazer.');
            }
            await this.audit.record(tx, ctx, { action: 'push_campaign.cancelled', targetType: 'push_campaign', targetId: id, reason });
            return this.present(row);
        });
    }
    async get(id) {
        const [row] = await this.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, id));
        if (!row)
            throw errors.notFound('Campanha não encontrada.');
        const m = (await this.metrics([id])).get(id);
        return this.present(row, m?.opened ?? 0, m?.unsubscribed ?? 0);
    }
    async list(query) {
        const limit = parseLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const rows = await this.db
            .select()
            .from(pushCampaigns)
            .where(and(query.status ? eq(pushCampaigns.status, query.status) : undefined, cursor ? sql `(${pushCampaigns.createdAt}, ${pushCampaigns.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined))
            .orderBy(desc(pushCampaigns.createdAt), desc(pushCampaigns.id))
            .limit(limit + 1);
        const page = rows.slice(0, limit);
        const metrics = await this.metrics(page.map((r) => r.id));
        const last = page.at(-1);
        return { data: page.map((r) => this.present(r, metrics.get(r.id)?.opened ?? 0, metrics.get(r.id)?.unsubscribed ?? 0)), nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
    }
    /** O app avisa que o cliente tocou na notificação (idempotente; só para quem recebeu a campanha). */
    async markOpened(userId, campaignId) {
        await this.db.update(pushCampaignRecipients).set({ openedAt: new Date() }).where(and(eq(pushCampaignRecipients.campaignId, campaignId), eq(pushCampaignRecipients.userId, userId), isNull(pushCampaignRecipients.openedAt)));
    }
    // -------------------------------------------------------------------- envio
    /** Varredura (1 min): envia as campanhas vencidas dentro da janela; fora dela, empurra para o próximo início. */
    async processDue(now = new Date()) {
        const totals = { sent: 0, deferred: 0, cancelled: 0 };
        await this.failStuck(now);
        const window = await this.params.get('push_mkt_janela').then(String);
        for (;;) {
            const claimed = await this.db.execute(sql `
        update push_campaigns set status = 'sending', sending_started_at = ${now.toISOString()}::timestamptz, attempts = attempts + 1
        where id = (select id from push_campaigns where status = 'scheduled' and send_at <= ${now.toISOString()}::timestamptz order by send_at for update skip locked limit 1)
        returning id`);
            const id = claimed.rows[0]?.id;
            if (!id)
                return totals;
            const [campaign] = await this.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, id));
            if (!campaign)
                continue;
            const nextStart = nextWindowStart(now, window);
            if (nextStart.getTime() > now.getTime()) {
                await this.db.update(pushCampaigns).set({ status: 'scheduled', sendAt: nextStart }).where(eq(pushCampaigns.id, id));
                totals.deferred += 1;
                continue;
            }
            try {
                const outcome = await this.dispatch(campaign, now);
                totals[outcome] += 1;
            }
            catch (error) {
                this.logger.error(`campanha ${id} falhou: ${safeErrorMessage(error)}`);
                // SEC-165: quem já recebeu está em `push_campaign_recipients` (gravado logo depois do envio) e não recebe de novo. Teto de 3
                // tentativas; depois a campanha é cancelada com alerta (nunca reenviada em laço).
                if (campaign.attempts >= MAX_SEND_ATTEMPTS) {
                    await this.failCampaign(id, `Falhou ${MAX_SEND_ATTEMPTS} vezes no envio`);
                    totals.cancelled += 1;
                }
                else {
                    await this.db.update(pushCampaigns).set({ status: 'scheduled', sendAt: new Date(now.getTime() + 5 * 60_000) }).where(eq(pushCampaigns.id, id));
                }
            }
        }
    }
    async failCampaign(id, reason) {
        await this.db.update(pushCampaigns).set({ status: 'cancelled', cancelReason: reason }).where(eq(pushCampaigns.id, id));
        await this.db.insert(t.paymentAlerts).values({ attemptId: null, kind: 'push_campaign_failed', details: { campaignId: id, reason } });
    }
    /** SEC-165: campanha em `sending` há mais de 30 min (processo caiu no meio) não é reenviada: vira cancelada e alerta o admin. */
    async failStuck(now) {
        const cutoff = new Date(now.getTime() - 30 * 60_000);
        const stuck = await this.db.select({ id: pushCampaigns.id }).from(pushCampaigns).where(and(eq(pushCampaigns.status, 'sending'), lte(pushCampaigns.sendingStartedAt, cutoff))).limit(20);
        for (const { id } of stuck)
            await this.failCampaign(id, 'Envio interrompido (presa em envio por mais de 30 minutos); confira quem recebeu antes de reagendar');
        return stuck.length;
    }
    async cancelAtSend(campaign, reason) {
        await this.db.transaction(async (tx) => {
            await tx.update(pushCampaigns).set({ status: 'cancelled', cancelReason: reason }).where(eq(pushCampaigns.id, campaign.id));
            await this.audit.record(tx, SYSTEM_CTX, { action: 'push_campaign.cancelled', targetType: 'push_campaign', targetId: campaign.id, reason, actorId: null, actorRole: 'system' });
        });
        return 'cancelled';
    }
    async dispatch(campaign, now) {
        if (!(await this.flags.isEnabled('push_marketing')))
            return this.cancelAtSend(campaign, 'Push de marketing desligado no envio');
        const segment = campaign.segment;
        const [audience, min] = await Promise.all([this.audience(segment), this.params.getNumber('push_mkt_min_segmento')]);
        if (audience.eligible < min)
            return this.cancelAtSend(campaign, 'Segmento abaixo do mínimo no envio');
        const userIds = await this.recipients(segment, campaign.id);
        const devices = userIds.length === 0 ? [] : await this.db.select().from(t.pushDevices).where(and(inArray(t.pushDevices.userId, userIds), isNull(t.pushDevices.disabledAt)));
        const data = { type: 'campaign', campaignId: campaign.id, destination: campaign.destination.type, ...(campaign.destination.id ? { id: campaign.destination.id } : {}), ...(campaign.destination.code ? { code: campaign.destination.code } : {}) };
        const messages = devices.map((d) => ({ to: d.token, title: campaign.title, body: campaign.body, data }));
        const results = await this.push.send(messages);
        const reached = new Set();
        const dead = [];
        devices.forEach((d, i) => {
            if (results[i]?.ok)
                reached.add(d.userId);
            if (results[i]?.invalidToken)
                dead.push(d.id);
        });
        // SEC-165: quem recebeu é gravado ANTES do resto (auditoria, contadores): se a próxima transação falhar, o retry não reenvia a eles.
        if (reached.size > 0)
            await this.db.insert(pushCampaignRecipients).values([...reached].map((userId) => ({ campaignId: campaign.id, userId, sentAt: now }))).onConflictDoNothing();
        const [{ total: totalRecipients } = { total: 0 }] = await this.db.select({ total: sql `count(*)::int` }).from(pushCampaignRecipients).where(eq(pushCampaignRecipients.campaignId, campaign.id));
        await this.db.transaction(async (tx) => {
            if (dead.length > 0)
                await tx.update(t.pushDevices).set({ disabledAt: new Date() }).where(inArray(t.pushDevices.id, dead));
            await tx.update(pushCampaigns).set({ status: 'sent', sentAt: now, recipientsCount: totalRecipients, deliveredCount: sql `${pushCampaigns.deliveredCount} + ${results.filter((r) => r.ok).length}`, excludedByCapCount: audience.excludedByCap }).where(eq(pushCampaigns.id, campaign.id));
            await this.audit.record(tx, SYSTEM_CTX, { action: 'push_campaign.sent', targetType: 'push_campaign', targetId: campaign.id, after: { recipients: reached.size, messages: messages.length }, actorId: null, actorRole: 'system' });
        });
        return 'sent';
    }
};
PushCampaignsService = PushCampaignsService_1 = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, ParametersService,
        FeatureFlagsService,
        AuditService,
        PushTransport])
], PushCampaignsService);
export { PushCampaignsService };
//# sourceMappingURL=push-campaigns.service.js.map