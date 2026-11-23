import { composeDiscount, minSubtotalForSelfFunded, type CompositionOrder, type CompositionRule, type FundingSource } from './composition.js';

/**
 * Conferências de ativação (WB-340 C1 a C11, ADR-019 D3 e D8), função PURA: a mesma lista alimenta a caixa "Para ativar" (`Campaign.activation`), a simulação, o
 * `activateCampaign` (reconfere TUDO sob a trava, nunca confia na simulação) e a varredura que liga `scheduled -> active` (SEC-224: repete as MESMAS conferências).
 */
export type ActivationCode =
  | 'NAME_REQUIRED'
  | 'VALUE_REQUIRED'
  | 'BUDGET_REQUIRED'
  | 'USAGE_OR_BUDGET_REQUIRED'
  | 'MIN_ORDER_TOO_LOW'
  | 'GLOBAL_BUDGET_ZERO'
  | 'GLOBAL_BUDGET_EXCEEDED'
  | 'ABOVE_MARGIN_SUPER_ADMIN_ONLY'
  | 'LOSS_RISK_ACK_REQUIRED'
  | 'NO_ACCEPTED_STORE'
  | 'FREE_SHIPPING_DISABLED'
  | 'STORE_SHARE_DISABLED'
  | 'FREE_SHIPPING_FUNDING_INVALID'
  | 'PERCENT_CAP_REQUIRED'
  | 'STARTS_AFTER_ENDS';

export interface ActivationBlocker {
  code: ActivationCode;
  message: string;
  requiredMinOrderCents?: number;
  missingCents?: number;
}

export interface CampaignFacts {
  name: string;
  owner: 'webag' | 'store';
  funding: FundingSource;
  storeSharePct: number;
  kind: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  percentCapCents: number | null;
  minOrderCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  budgetTotalCents: number | null;
  budgetDailyCents: number | null;
  maxUses: number | null;
}

/** Uma faixa da tabela de entrega (ou a retirada) com o que a composição precisa. */
export interface BandInput {
  id: string;
  label: string;
  fromM: number | null;
  toM: number | null;
  pickup: boolean;
  deliveryFeeCents: number;
  courierCostCents: number;
}

export interface ActivationContext {
  freeShippingEnabled: boolean;
  storeShareEnabled: boolean;
  /** `cupom_orcamento_mensal_webag_cents`. */
  monthlyBudgetCents: number;
  /** Soma do que as OUTRAS campanhas vivas ainda podem gastar (total menos gasto) mais o gasto confirmado no mês (America/Sao_Paulo). */
  committedCents: number;
  acceptedStores: number;
  autofinTetoPct: number;
  minTotalCents: number;
  referenceCommissionPct: number;
  serviceFeeOf: (subtotalCents: number) => number;
  bands: BandInput[];
}

export interface BandResult {
  band: BandInput;
  marginCents: number;
  commissionCents: number;
  serviceFeeCents: number;
  discountGrossCents: number;
  discountStoreCents: number;
  discountWebagCents: number;
  remainingCents: number;
  minOrderNeededCents: number | null;
  applicable: boolean;
}

export const REFERENCE_SUBTOTAL_CENTS = 8000;

const bpOf = (pct: number): number => Math.round(pct * 100);
const commissionFn = (pct: number) => (subtotalCents: number, storeDiscountCents: number): number => Math.floor(((subtotalCents - storeDiscountCents) * bpOf(pct) * 2 + 10_000) / 20_000);

export const hasWebagCost = (funding: FundingSource): boolean => funding !== 'store';

/** Calcula cada faixa para o pedido de referência (a simulação e as conferências usam o mesmo resultado). */
export function simulateBands(facts: Pick<CampaignFacts, 'funding' | 'storeSharePct' | 'kind' | 'value' | 'percentCapCents' | 'minOrderCents'>, ctx: Pick<ActivationContext, 'bands' | 'autofinTetoPct' | 'minTotalCents' | 'referenceCommissionPct' | 'serviceFeeOf'>, referenceSubtotalCents?: number): { referenceSubtotalCents: number; rows: BandResult[] } {
  const rule: CompositionRule = { funding: facts.funding, storeSharePct: facts.storeSharePct, kind: facts.kind, value: facts.value, percentCapCents: facts.percentCapCents };
  const base = (band: BandInput): Omit<CompositionOrder, 'subtotalCents'> => ({
    deliveryFeeCents: band.deliveryFeeCents,
    serviceFeeOf: ctx.serviceFeeOf,
    commissionOf: commissionFn(ctx.referenceCommissionPct),
    courierCostCents: band.pickup ? 0 : band.courierCostCents,
    autofinTetoPct: ctx.autofinTetoPct,
    minTotalCents: ctx.minTotalCents,
  });
  // O pedido de referência é o mínimo necessário na faixa mais exigente (autofinanciado) ou R$ 80,00 (D5 do contrato).
  let reference = referenceSubtotalCents ?? Math.max(REFERENCE_SUBTOTAL_CENTS, facts.minOrderCents);
  const needed: (number | null)[] = ctx.bands.map((band) => (facts.funding === 'self_funded' ? minSubtotalForSelfFunded(rule, base(band), facts.minOrderCents) : null));
  if (referenceSubtotalCents === undefined && facts.funding === 'self_funded') {
    const known = needed.filter((n): n is number => n !== null);
    if (known.length > 0) reference = Math.max(reference, ...known);
  }
  const rows: BandResult[] = ctx.bands.map((band, index) => {
    const order: CompositionOrder = { ...base(band), subtotalCents: reference };
    const result = composeDiscount(rule, order);
    const serviceFee = ctx.serviceFeeOf(reference);
    if (result.ok) {
      return { band, marginCents: result.marginCents, commissionCents: order.commissionOf(reference, result.storeCents), serviceFeeCents: serviceFee, discountGrossCents: result.grossCents, discountStoreCents: result.storeCents, discountWebagCents: result.webagCents, remainingCents: result.remainingCents, minOrderNeededCents: needed[index] ?? null, applicable: true };
    }
    return { band, marginCents: result.marginCents, commissionCents: order.commissionOf(reference, 0), serviceFeeCents: serviceFee, discountGrossCents: result.grossCents, discountStoreCents: 0, discountWebagCents: 0, remainingCents: result.marginCents, minOrderNeededCents: needed[index] ?? null, applicable: false };
  });
  return { referenceSubtotalCents: reference, rows };
}

/** Pior caso por pedido do desconto da Webag (percentual com teto: o teto em R$; fixo: o valor; frete: a maior entrega), por faixa. */
export function worstCaseWebag(facts: Pick<CampaignFacts, 'funding' | 'storeSharePct' | 'kind' | 'value' | 'percentCapCents'>, bands: BandInput[]): { webagCents: number; band: BandInput | null } {
  if (!hasWebagCost(facts.funding)) return { webagCents: 0, band: null };
  let worst = 0;
  let worstBand: BandInput | null = null;
  for (const band of bands) {
    const gross = facts.kind === 'free_shipping' ? band.deliveryFeeCents : facts.kind === 'fixed' ? facts.value : (facts.percentCapCents ?? 0);
    const share = facts.funding === 'split' ? facts.storeSharePct : 0;
    const webag = gross - Math.floor((gross * share + 50) / 100);
    if (webag >= worst) {
      worst = webag;
      worstBand = band;
    }
  }
  return { webagCents: worst, band: worstBand };
}

const money = (cents: number): string => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

export interface ActivationVerdict {
  blockers: ActivationBlocker[];
  requiresStepUp: boolean;
  requiresSuperAdmin: boolean;
  aboveMargin: boolean;
  maxCostCents: number | null;
}

/** Lista TUDO o que impede ativar (a tela nunca esconde o botão sem dizer o motivo) e se a ativação exige 2º fator e super admin. */
export function checkActivation(facts: CampaignFacts, ctx: ActivationContext): ActivationVerdict {
  const blockers: ActivationBlocker[] = [];
  const add = (blocker: ActivationBlocker): number => blockers.push(blocker);
  const webagCost = hasWebagCost(facts.funding);

  if (facts.name.trim().length < 2) add({ code: 'NAME_REQUIRED', message: 'Dê um nome à campanha.' });
  if (facts.kind !== 'free_shipping' && facts.value < 1) add({ code: 'VALUE_REQUIRED', message: 'Informe o valor do desconto.' });
  if (facts.startsAt && facts.endsAt && facts.endsAt <= facts.startsAt) add({ code: 'STARTS_AFTER_ENDS', message: 'O fim precisa ser depois do início.' });
  if (facts.kind === 'free_shipping' && !['webag', 'self_funded'].includes(facts.funding)) add({ code: 'FREE_SHIPPING_FUNDING_INVALID', message: 'O frete é da Webag.' });
  if (facts.kind === 'free_shipping' && !ctx.freeShippingEnabled) add({ code: 'FREE_SHIPPING_DISABLED', message: 'Frete grátis em campanha ainda não foi liberado (parecer jurídico J22).' });
  if ((facts.funding === 'store' || facts.funding === 'split' || facts.owner === 'store') && !ctx.storeShareEnabled) add({ code: 'STORE_SHARE_DISABLED', message: 'Campanha com parte da loja ainda não foi liberada (parecer jurídico J27).' });
  if (facts.kind === 'percent' && ['webag', 'split'].includes(facts.funding) && facts.percentCapCents === null) add({ code: 'PERCENT_CAP_REQUIRED', message: 'Percentual com custo da Webag precisa de um teto em reais por pedido.' });
  if (webagCost && (facts.budgetTotalCents === null || facts.budgetDailyCents === null)) add({ code: 'BUDGET_REQUIRED', message: 'Defina o orçamento total e o diário da Webag.' });
  if (facts.maxUses === null && facts.budgetTotalCents === null) add({ code: 'USAGE_OR_BUDGET_REQUIRED', message: 'Defina o limite de usos ou o orçamento.' });
  if ((facts.funding === 'store' || facts.funding === 'split') && ctx.acceptedStores === 0) add({ code: 'NO_ACCEPTED_STORE', message: 'Nenhuma loja aceitou o convite ainda.' });

  const sim = simulateBands(facts, ctx);
  if (facts.funding === 'self_funded') {
    const known = sim.rows.map((r) => r.minOrderNeededCents).filter((n): n is number => n !== null);
    const required = known.length > 0 ? Math.max(...known) : null;
    if (required !== null && facts.minOrderCents < required) add({ code: 'MIN_ORDER_TOO_LOW', message: `O pedido mínimo precisa ser de pelo menos ${money(required)} para o desconto caber na margem de todas as faixas.`, requiredMinOrderCents: required });
    if (known.length === 0 && ctx.bands.length > 0) add({ code: 'MIN_ORDER_TOO_LOW', message: 'Com estes valores o desconto não cabe na margem de nenhuma faixa.', requiredMinOrderCents: 1_000_000 });
  }

  let aboveMargin = false;
  if (facts.funding === 'webag' || facts.funding === 'split') {
    const worst = worstCaseWebag(facts, ctx.bands);
    aboveMargin = sim.rows.some((r) => r.marginCents < worst.webagCents || r.marginCents <= 0);
  }
  if (aboveMargin) add({ code: 'ABOVE_MARGIN_SUPER_ADMIN_ONLY', message: 'O desconto da Webag fica acima da margem prevista em alguma faixa: só o super admin ativa.' });

  if (webagCost) {
    if (ctx.monthlyBudgetCents <= 0) add({ code: 'GLOBAL_BUDGET_ZERO', message: 'Orçamento mensal de cupons da Webag é R$ 0. Defina em Configurações.' });
    else if (facts.budgetTotalCents !== null && facts.budgetTotalCents > ctx.monthlyBudgetCents - ctx.committedCents) {
      add({ code: 'GLOBAL_BUDGET_EXCEEDED', message: 'O orçamento desta campanha passa do orçamento mensal global da Webag.', missingCents: facts.budgetTotalCents - (ctx.monthlyBudgetCents - ctx.committedCents) });
    }
  }
  return { blockers, requiresStepUp: webagCost, requiresSuperAdmin: aboveMargin, aboveMargin, maxCostCents: webagCost ? facts.budgetTotalCents : null };
}
