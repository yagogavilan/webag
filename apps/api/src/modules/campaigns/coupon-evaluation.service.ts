import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { ParametersService } from '../admin/index.js';
import { campaigns, type Campaign } from './db/schema.js';
import { composeDiscount, minSubtotalForSelfFunded, shortfallCents, type Composition, type CompositionOrder, type CompositionRefusal, type CompositionRule } from './domain/composition.js';
import { FraudService, type FraudSubject } from './fraud.service.js';

/** Códigos de recusa que a sacola devolve (o app decide o texto pelo `code`); a mensagem neutra do antifraude nunca diz qual identificador casou (RN-C11). */
export type CampaignRejection =
  | 'COUPON_NOT_FOUND'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_EXHAUSTED'
  | 'COUPON_EXHAUSTED_TODAY'
  | 'COUPON_OTHER_STORE'
  | 'COUPON_FIRST_PURCHASE_ONLY'
  | 'COUPON_NOT_APPLICABLE'
  | 'COUPON_UNAVAILABLE'
  | 'COUPON_SHORTFALL';

export interface EvaluationInput {
  campaignId: string;
  visibility: 'public' | 'private';
  userId: string;
  email: string;
  store: { id: string; cityId: string | null; categoryId: string | null };
  address: { cep: string | null; number: string | null } | null;
  /** O que a sacola SABE (a composição precisa do pedido real: subtotal, entrega, taxa de serviço, comissão por item e custo previsto do motoboy). */
  order: Omit<CompositionOrder, 'autofinTetoPct' | 'minTotalCents'> & { minTotalCents: number };
  /** Dados de pedidos (o `cart` é dono do histórico de compras): usados na primeira compra e na reativação. */
  daysSinceLastDelivery: () => Promise<number | null>;
}

export interface EvaluationResult {
  rejection: CampaignRejection | null;
  /** A conta do desconto (loja e Webag); nula se a campanha recusou. */
  plan: (Composition & { campaignId: string; funding: Campaign['fundingSource'] }) | null;
  /** `COUPON_SHORTFALL`: o subtotal que libera o desconto e quanto falta (R$ 0,01 no mínimo). */
  shortfall: { neededSubtotalCents: number; missingCents: number } | null;
}

/**
 * Porta de `campaigns` para a sacola (B2): o `cart` não lê `campaigns` nem `coupon_reservations`; pergunta aqui se o cupom ligado a uma campanha vale AGORA e qual é o desconto
 * composto (RN-C1 a C3, função pura `composeDiscount`). A reserva de verdade acontece na criação do pedido, sob a trava (`ReservationService`): esta leitura é só a cotação.
 */
@Injectable()
export class CouponEvaluationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly fraud: FraudService,
    private readonly params: ParametersService,
  ) {}

  private ruleOf(c: Campaign): CompositionRule {
    return { funding: c.fundingSource, storeSharePct: c.storeSharePct, kind: c.kind, value: c.value, percentCapCents: c.percentCapCents };
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const none = (rejection: CampaignRejection): EvaluationResult => ({ rejection, plan: null, shortfall: null });
    const [c] = await this.db.select().from(campaigns).where(eq(campaigns.id, input.campaignId));
    const hidden: CampaignRejection = 'COUPON_NOT_FOUND';
    if (!c) return none(hidden);
    // estado e janela (a resposta não varia com o tempo de busca: ordem fixa, WB-344 C14d)
    if (c.state === 'scheduled') return none('COUPON_NOT_STARTED');
    if (c.state === 'ended') return none('COUPON_EXPIRED');
    if (c.state !== 'active') return none(hidden);
    const now = new Date();
    if (c.startsAt && now < c.startsAt) return none('COUPON_NOT_STARTED');
    if (c.endsAt && now >= c.endsAt) return none('COUPON_EXPIRED');
    // alvo: cupom privado ou de outro público não revela que existe
    const t = c.targetKind;
    if (t === 'store' && c.targetStoreId !== input.store.id) return none(input.visibility === 'public' ? 'COUPON_OTHER_STORE' : hidden);
    if ((t === 'city' && c.targetCityId !== input.store.cityId) || (t === 'category' && c.targetCategoryId !== input.store.categoryId)) return none(hidden);
    if (c.audience === 'reactivation') {
      const days = await input.daysSinceLastDelivery();
      if (days === null || days < c.reactivationDays) return none(hidden);
    }
    // composição (autofinanciado: tudo ou nada)
    const order: CompositionOrder = { ...input.order, autofinTetoPct: await this.params.getNumber('autofin_teto_pct') };
    const plan = composeDiscount(this.ruleOf(c), order);
    if (!plan.ok) return this.refusal(c, plan, order);
    // esgotado: total, dia e usos (sem trava aqui: a decisão final é da reserva)
    const [day] = (await this.db.execute<{ used: number | null; limit_cents: number | null }>(sql`select reserved_cents + spent_cents as used, limit_cents from campaign_budget_days where campaign_id = ${c.id}::uuid and day = (now() at time zone 'America/Sao_Paulo')::date`)).rows;
    if (c.maxUses !== null && c.usesReserved + c.usesConfirmed >= c.maxUses) return none('COUPON_EXHAUSTED');
    if (plan.webagCents > 0) {
      if (c.budgetTotalCents === null || c.budgetReservedCents + c.budgetSpentCents + plan.webagCents > c.budgetTotalCents) return none('COUPON_EXHAUSTED');
      if (c.budgetDailyCents !== null && (day?.used ?? 0) + plan.webagCents > (day?.limit_cents ?? c.budgetDailyCents)) return none('COUPON_EXHAUSTED_TODAY');
    }
    // antifraude (leitura; a decisão final é sob a trava)
    if ((await this.fraud.hasOpenSignal(input.userId)) || (await this.fraud.tooManyReturns(input.userId))) return none('COUPON_NOT_APPLICABLE');
    if (c.audience === 'first_purchase') {
      const subject: FraudSubject = { userId: input.userId, email: input.email, deviceIds: await this.fraud.deviceIdsOf(input.userId, null), address: input.address };
      const taken = await this.fraud.firstPurchaseTaken(this.fraud.identifiersOf(subject));
      if (taken) return none(input.visibility === 'public' ? taken : hidden);
    }
    return { rejection: null, plan: { ...plan, campaignId: c.id, funding: c.fundingSource }, shortfall: null };
  }

  /** Autofinanciado recusado: margem <= 0 é `UNAVAILABLE`; acima do teto da margem é `SHORTFALL` com o "Faltam R$ X" (busca binária com verificação, R12) ou `UNAVAILABLE` se não resolve. */
  private refusal(c: Campaign, r: CompositionRefusal, order: CompositionOrder): EvaluationResult {
    if (r.reason === 'UNAVAILABLE') return { rejection: 'COUPON_UNAVAILABLE', plan: null, shortfall: null };
    const { subtotalCents: current, ...rest } = order;
    const needed = minSubtotalForSelfFunded(this.ruleOf(c), rest, c.minOrderCents, current);
    if (needed === null) return { rejection: 'COUPON_UNAVAILABLE', plan: null, shortfall: null };
    return { rejection: 'COUPON_SHORTFALL', plan: null, shortfall: { neededSubtotalCents: needed, missingCents: shortfallCents(needed, current) } };
  }
}
