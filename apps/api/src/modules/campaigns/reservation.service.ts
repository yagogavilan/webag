import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { campaignBudgetDays, campaignBudgetEntries, campaignStoreEnrollments, campaignStoreMonths, campaigns, couponReservations, type Campaign, type CouponReservation } from './db/schema.js';
import { roundHalfUp } from './domain/composition.js';
import { FraudService, type FraudIdentifier } from './fraud.service.js';

export interface ReserveInput {
  orderId: string;
  userId: string;
  campaignId: string;
  store: { id: string; cityId: string | null; categoryId: string | null };
  /** A conta do pedido (`computeOrderFinance`, fonte única, R10): `webagCents` = `platformDiscountCents`, `storeCents` = `storeCouponCents`. */
  webagCents: number;
  storeCents: number;
  /** O que a cotação mostrou ao cliente, para conferir contra a campanha sob a trava (R11). */
  quoted: { kind: string; value: number; percentCapCents: number | null; minOrderCents: number; subtotalCents: number };
  identifiers: FraudIdentifier[];
  /** O total que o cliente viu e o do servidor: diferença sob a trava vira 409 `DISCOUNT_CHANGED`. */
  expectedTotalCents: number;
  totalCents: number;
}

/** 409 `CART_CHANGED` com `DISCOUNT_CHANGED`: nada reservado, nada cobrado; o app já trata e o pedido sem cupom só nasce depois de o cliente ver o total novo. */
export const discountChanged = (fromCents: number, toCents: number) =>
  errors.conflict('CART_CHANGED', 'O valor mudou', 'Confira o novo total antes de pagar.', { changes: [{ kind: 'DISCOUNT_CHANGED', fromCents, toCents }] });

const todayInSaoPaulo = sql<string>`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
const monthInSaoPaulo = sql<string>`date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date`;

/**
 * Reserva atômica, confirmação e devolução do orçamento da campanha (ADR-019 D4, C-CUP-02/03/10). Tudo roda na transação do pedido (ou do pagamento, do fechamento, do estorno).
 *
 * ORDEM GLOBAL DE TRAVAS (B1): pedido -> advisory por HMAC (`prepare`) -> estoque por id -> CAMPANHA (aqui) -> adesão da loja -> linhas de dia e mês -> reserva e diário. Quem chama já
 * travou o pedido e mexeu no estoque ANTES; este serviço nunca toca em estoque nem em `orders`. Toda transição é condicional (`UPDATE ... WHERE state = ...`): expirar e cancelar o
 * mesmo pedido em paralelo devolvem UMA vez.
 */
@Injectable()
export class ReservationService {
  constructor(private readonly fraud: FraudService) {}

  /** Passo 3 da ordem global (antes do estoque): trava os HMACs da primeira compra, em ordem fixa. Sem primeira compra não há o que travar. */
  async prepare(tx: Tx, input: { firstPurchase: boolean; identifiers: FraudIdentifier[] }): Promise<void> {
    if (input.firstPurchase) await this.fraud.lockFirstPurchase(tx, input.identifiers);
  }

  /** Trava a campanha (passo 5). Devolve `null` se não existe. */
  private async lockCampaign(tx: Tx, campaignId: string): Promise<Campaign | null> {
    const [row] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).for('update');
    return row ?? null;
  }

  /**
   * Reserva sob a trava da campanha. Reconfere estado, janela, alvo, aceite da loja, usos, limite por cliente e o orçamento (total, dia e mês da loja) com UPDATE guardado, e
   * recalcula o que a cotação mostrou. Qualquer falha lança e a transação do pedido desfaz tudo (sem reserva órfã).
   */
  async reserve(tx: Tx, input: ReserveInput): Promise<void> {
    const campaign = await this.lockCampaign(tx, input.campaignId);
    const changed = () => discountChanged(input.expectedTotalCents, input.expectedTotalCents + input.webagCents + input.storeCents);
    if (!campaign || campaign.state !== 'active') throw changed();
    const [clock] = (await tx.execute<{ ok: boolean; day: string; month: string }>(sql`select (now() >= ${campaign.startsAt}::timestamptz and now() < ${campaign.endsAt}::timestamptz) as ok, ${todayInSaoPaulo} as day, ${monthInSaoPaulo} as month`)).rows;
    if (!clock?.ok) throw changed();
    // alvo (C-CUP-10: reconferido sob a trava, nunca confia na cotação nem no cache)
    const target = campaign.targetKind;
    if ((target === 'store' && campaign.targetStoreId !== input.store.id) || (target === 'city' && campaign.targetCityId !== input.store.cityId) || (target === 'category' && campaign.targetCategoryId !== input.store.categoryId)) throw changed();
    // a regra que o cliente viu é a da campanha (a campanha ativa não muda, mas o espelho em `coupons` é conferido, DT-104)
    const q = input.quoted;
    if (campaign.kind !== q.kind || campaign.value !== q.value || campaign.percentCapCents !== q.percentCapCents || campaign.minOrderCents !== q.minOrderCents || q.subtotalCents < campaign.minOrderCents) throw changed();
    if (input.webagCents + input.storeCents <= 0) throw changed();
    if (campaign.fundingSource === 'store' && input.webagCents > 0) throw changed(); // "Loja paga" nunca gasta o orçamento da Webag (SEC-229)
    if (input.expectedTotalCents !== input.totalCents) throw changed();

    // adesão da loja (passo 6): só com parte da loja; sem aceite vigente não há desconto naquela loja (RN-C5)
    let monthlyCap: number | null = null;
    if (input.storeCents > 0 || campaign.storeSharePct > 0) {
      const [enrollment] = await tx.select().from(campaignStoreEnrollments).where(and(eq(campaignStoreEnrollments.campaignId, campaign.id), eq(campaignStoreEnrollments.storeId, input.store.id))).for('update');
      if (campaign.owner === 'store' && campaign.ownerStoreId === input.store.id) {
        const [month] = await tx.select({ limit: campaignStoreMonths.limitCents }).from(campaignStoreMonths).where(and(eq(campaignStoreMonths.campaignId, campaign.id), eq(campaignStoreMonths.storeId, input.store.id), eq(campaignStoreMonths.month, clock.month)));
        monthlyCap = month?.limit ?? enrollment?.monthlyCapCents ?? null;
      } else {
        if (!enrollment || enrollment.state !== 'accepted' || !enrollment.monthlyCapCents) throw changed();
        monthlyCap = enrollment.monthlyCapCents;
      }
      if (monthlyCap === null) throw changed();
    }

    // antifraude sob a trava: limite por cliente, sinais abertos, devoluções, primeira compra, uso por aparelho
    const [mine] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(couponReservations)
      .where(and(eq(couponReservations.userId, input.userId), eq(couponReservations.campaignId, campaign.id), inArray(couponReservations.state, ['reserved', 'confirmed'])));
    if ((mine?.n ?? 0) >= campaign.perCustomerLimit) throw errors.unprocessable('COUPON_ALREADY_USED', 'Cupom já utilizado', { detail: 'Você já usou este cupom.' });
    if ((await this.fraud.hasOpenSignal(input.userId, tx)) || (await this.fraud.tooManyReturns(input.userId, tx))) throw this.fraud.neutral();
    if (campaign.audience === 'first_purchase') {
      const refusal = await this.fraud.claimFirstPurchase(tx, { campaignId: campaign.id, orderId: input.orderId }, input.identifiers);
      if (refusal === 'COUPON_FIRST_PURCHASE_ONLY') throw errors.unprocessable('COUPON_FIRST_PURCHASE_ONLY', 'Cupom só para a primeira compra', { detail: 'Este cupom é só para a primeira compra.' });
      if (refusal) throw this.fraud.neutral();
    }
    if ((await this.fraud.claimCampaignUse(tx, { campaignId: campaign.id, orderId: input.orderId, perCustomerLimit: campaign.perCustomerLimit }, input.identifiers)) !== null) throw this.fraud.neutral();

    // orçamento: UPDATE guardado (0 linhas = esgotado), o CHECK do banco é a 2ª camada
    const w = input.webagCents;
    const total = await tx.execute(sql`
      update campaigns set budget_reserved_cents = budget_reserved_cents + ${w}, uses_reserved = uses_reserved + 1, updated_at = now()
       where id = ${campaign.id}::uuid
         and (max_uses is null or uses_reserved + uses_confirmed + 1 <= max_uses)
         and (${w} = 0 or (budget_total_cents is not null and budget_reserved_cents + budget_spent_cents + ${w} <= budget_total_cents))
      returning id`);
    if (total.rowCount !== 1) throw changed();
    if (w > 0) {
      await tx.insert(campaignBudgetDays).values({ campaignId: campaign.id, day: clock.day, limitCents: campaign.budgetDailyCents ?? campaign.budgetTotalCents ?? w }).onConflictDoNothing();
      const day = await tx.execute(sql`
        update campaign_budget_days set reserved_cents = reserved_cents + ${w}
         where campaign_id = ${campaign.id}::uuid and day = ${clock.day}::date and reserved_cents + spent_cents + ${w} <= limit_cents returning campaign_id`);
      if (day.rowCount !== 1) throw changed();
    }
    const s = input.storeCents;
    if (s > 0) {
      await tx.insert(campaignStoreMonths).values({ campaignId: campaign.id, storeId: input.store.id, month: clock.month, limitCents: monthlyCap! }).onConflictDoNothing();
      const month = await tx.execute(sql`
        update campaign_store_months set reserved_cents = reserved_cents + ${s}
         where campaign_id = ${campaign.id}::uuid and store_id = ${input.store.id}::uuid and month = ${clock.month}::date and reserved_cents + spent_cents + ${s} <= limit_cents returning campaign_id`);
      if (month.rowCount !== 1) throw changed();
    }

    const [reservation] = await tx
      .insert(couponReservations)
      .values({ orderId: input.orderId, campaignId: campaign.id, userId: input.userId, storeId: input.store.id, webagCents: w, storeCents: s, day: clock.day, month: clock.month })
      .returning({ id: couponReservations.id });
    if (!reservation) throw new Error('reserva não criada');
    await this.writeEntries(tx, campaign.id, input.orderId, reservation.id, input.store.id, 'reserve', clock.day, clock.month, w, s, `res:${reservation.id}:reserve`);
    await this.fraud.recordSightings(tx, { userId: input.userId, orderId: input.orderId, campaignId: campaign.id }, input.identifiers);
  }

  private async writeEntries(tx: Tx, campaignId: string, orderId: string, reservationId: string, storeId: string, kind: 'reserve' | 'confirm' | 'release' | 'refund', day: string, month: string, webag: number, store: number, key: string): Promise<void> {
    const rows = [
      ...(webag > 0 ? [{ campaignId, reservationId, orderId, storeId: null, kind, funder: 'webag' as const, amountCents: webag, day, month, dedupeKey: `${key}:webag` }] : []),
      ...(store > 0 ? [{ campaignId, reservationId, orderId, storeId, kind, funder: 'store' as const, amountCents: store, day, month, dedupeKey: `${key}:store` }] : []),
    ];
    if (rows.length > 0) await tx.insert(campaignBudgetEntries).values(rows).onConflictDoNothing();
  }

  private async find(tx: Tx, orderId: string): Promise<CouponReservation | null> {
    const [row] = await tx.select().from(couponReservations).where(eq(couponReservations.orderId, orderId));
    return row ?? null;
  }

  /** Pagamento aprovado (depois de `commitSale`): `reserved -> confirmed`, o reservado vira gasto. Sem reserva (pedido sem campanha) ou já devolvida (PIX tardio): não faz nada. */
  async confirm(tx: Tx, orderId: string): Promise<void> {
    const found = await this.find(tx, orderId);
    if (!found || found.state !== 'reserved') return;
    if (!(await this.lockCampaign(tx, found.campaignId))) return;
    const [r] = await tx.update(couponReservations).set({ state: 'confirmed', confirmedAt: new Date() }).where(and(eq(couponReservations.id, found.id), eq(couponReservations.state, 'reserved'))).returning();
    if (!r) return;
    const w = r.webagCents;
    const s = r.storeCents;
    await tx.update(campaigns).set({ budgetReservedCents: sql`${campaigns.budgetReservedCents} - ${w}`, budgetSpentCents: sql`${campaigns.budgetSpentCents} + ${w}`, usesReserved: sql`${campaigns.usesReserved} - 1`, usesConfirmed: sql`${campaigns.usesConfirmed} + 1`, updatedAt: new Date() }).where(eq(campaigns.id, r.campaignId));
    if (w > 0) await tx.update(campaignBudgetDays).set({ reservedCents: sql`${campaignBudgetDays.reservedCents} - ${w}`, spentCents: sql`${campaignBudgetDays.spentCents} + ${w}` }).where(and(eq(campaignBudgetDays.campaignId, r.campaignId), eq(campaignBudgetDays.day, r.day)));
    if (s > 0) await tx.update(campaignStoreMonths).set({ reservedCents: sql`${campaignStoreMonths.reservedCents} - ${s}`, spentCents: sql`${campaignStoreMonths.spentCents} + ${s}` }).where(and(eq(campaignStoreMonths.campaignId, r.campaignId), eq(campaignStoreMonths.storeId, r.storeId), eq(campaignStoreMonths.month, r.month)));
    await this.writeEntries(tx, r.campaignId, orderId, r.id, r.storeId, 'confirm', r.day, r.month, w, s, `res:${r.id}:confirm`);
  }

  /** Pedido expirou, foi cancelado ou recusado SEM pagamento (depois de `inventory.release`): `reserved -> returned`, uma única vez. Reserva já confirmada sai pelo estorno (`syncRefund`). */
  async release(tx: Tx, orderId: string, reason: 'expired' | 'cancelled' | 'admin'): Promise<void> {
    const found = await this.find(tx, orderId);
    if (!found || found.state !== 'reserved') return;
    if (!(await this.lockCampaign(tx, found.campaignId))) return;
    const [r] = await tx.update(couponReservations).set({ state: 'returned', returnedAt: new Date(), returnedReason: reason }).where(and(eq(couponReservations.id, found.id), eq(couponReservations.state, 'reserved'))).returning();
    if (!r) return; // outro caminho devolveu primeiro
    const w = r.webagCents;
    const s = r.storeCents;
    await tx.update(campaigns).set({ budgetReservedCents: sql`${campaigns.budgetReservedCents} - ${w}`, usesReserved: sql`${campaigns.usesReserved} - 1`, updatedAt: new Date() }).where(eq(campaigns.id, r.campaignId));
    if (w > 0) await tx.update(campaignBudgetDays).set({ reservedCents: sql`${campaignBudgetDays.reservedCents} - ${w}` }).where(and(eq(campaignBudgetDays.campaignId, r.campaignId), eq(campaignBudgetDays.day, r.day)));
    if (s > 0) await tx.update(campaignStoreMonths).set({ reservedCents: sql`${campaignStoreMonths.reservedCents} - ${s}` }).where(and(eq(campaignStoreMonths.campaignId, r.campaignId), eq(campaignStoreMonths.storeId, r.storeId), eq(campaignStoreMonths.month, r.month)));
    await this.writeEntries(tx, r.campaignId, orderId, r.id, r.storeId, 'release', r.day, r.month, w, s, `res:${r.id}:release`);
    await this.fraud.releaseClaims(tx, orderId, { releaseFirstPurchase: true });
    if (reason !== 'admin') await this.fraud.afterReturn(tx, { userId: r.userId, orderId, campaignId: r.campaignId });
  }

  /**
   * Estorno (total ou parcial) de pedido pago: `refunded_*_cents` = parcela cumulativa arredondada, com a MESMA fórmula do `refundLines` do razão (R10): a soma de vários
   * parciais é o estorno total e o diário bate com `platform_promo_expense`. Nunca passa do confirmado (CHECK). Devolver tudo vira `returned` e libera o uso; a primeira compra só
   * volta se o pedido NÃO foi entregue (Q17). `afterRefundedCents` é o acumulado do razão e `totalCents` o total pago do pedido.
   */
  async syncRefund(tx: Tx, orderId: string, input: { afterRefundedCents: number; totalCents: number; delivered: boolean }): Promise<void> {
    const found = await this.find(tx, orderId);
    if (!found || found.state !== 'confirmed' || input.totalCents <= 0) return;
    if (!(await this.lockCampaign(tx, found.campaignId))) return;
    const [r] = await tx.select().from(couponReservations).where(and(eq(couponReservations.id, found.id), eq(couponReservations.state, 'confirmed')));
    if (!r) return;
    const after = Math.min(input.afterRefundedCents, input.totalCents);
    const refundedW = roundHalfUp(r.webagCents * after, input.totalCents);
    const refundedS = roundHalfUp(r.storeCents * after, input.totalCents);
    const dw = refundedW - r.refundedWebagCents;
    const ds = refundedS - r.refundedStoreCents;
    if (dw <= 0 && ds <= 0 && after < input.totalCents) return;
    const full = after >= input.totalCents;
    await tx
      .update(couponReservations)
      .set({ refundedWebagCents: refundedW, refundedStoreCents: refundedS, ...(full ? { state: 'returned' as const, returnedAt: new Date(), returnedReason: 'refunded' as const } : {}) })
      .where(eq(couponReservations.id, r.id));
    await tx.update(campaigns).set({ budgetSpentCents: sql`${campaigns.budgetSpentCents} - ${Math.max(dw, 0)}`, ...(full ? { usesConfirmed: sql`${campaigns.usesConfirmed} - 1` } : {}), updatedAt: new Date() }).where(eq(campaigns.id, r.campaignId));
    if (dw > 0) await tx.update(campaignBudgetDays).set({ spentCents: sql`${campaignBudgetDays.spentCents} - ${dw}` }).where(and(eq(campaignBudgetDays.campaignId, r.campaignId), eq(campaignBudgetDays.day, r.day)));
    if (ds > 0) await tx.update(campaignStoreMonths).set({ spentCents: sql`${campaignStoreMonths.spentCents} - ${ds}` }).where(and(eq(campaignStoreMonths.campaignId, r.campaignId), eq(campaignStoreMonths.storeId, r.storeId), eq(campaignStoreMonths.month, r.month)));
    await this.writeEntries(tx, r.campaignId, orderId, r.id, r.storeId, 'refund', r.day, r.month, Math.max(dw, 0), Math.max(ds, 0), `res:${r.id}:refund:${after}`);
    if (full) await this.fraud.releaseClaims(tx, orderId, { releaseFirstPurchase: !input.delivered });
  }
}
