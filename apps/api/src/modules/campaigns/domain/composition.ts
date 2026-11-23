/**
 * Composição do desconto de uma campanha (ADR-019 D5, RN-C1 a C3), função PURA em centavos inteiros.
 *
 * DEC-088/F1: nada aqui majora preço, frete ou taxa. As 3 parcelas do pedido (subtotal, entrega, taxa de serviço) entram prontas e saem iguais;
 * só o desconto é calculado, dividido entre a loja e a Webag e limitado pelos tetos. Quem arca é sempre uma das 4 fontes.
 * É a ÚNICA fonte da conta: a simulação do admin, a vitrine ("Faltam R$ X") e a reserva sob a trava usam esta função.
 */
export type FundingSource = 'webag' | 'store' | 'split' | 'self_funded';
export type DiscountKind = 'percent' | 'fixed' | 'free_shipping';

/** `round_half_up` para inteiros não negativos (a mesma regra do cálculo do pedido). */
export const roundHalfUp = (numerator: number, denominator: number): number => Math.floor((numerator * 2 + denominator) / (denominator * 2));

export interface CompositionRule {
  funding: FundingSource;
  /** webag 0, store 100, split 1 a 99, self_funded 0 (CHECK `campaigns_funding_share`). */
  storeSharePct: number;
  kind: DiscountKind;
  /** Percentual (1 a 100) ou centavos (fixo); 0 no frete grátis. */
  value: number;
  percentCapCents: number | null;
}

export interface CompositionOrder {
  subtotalCents: number;
  /** Taxa de entrega cobrada (já com a regra "grátis acima de X"); 0 na retirada. */
  deliveryFeeCents: number;
  /** Taxa de serviço em função do subtotal (fixa ou percentual): usada na busca do "Faltam R$ X". */
  serviceFeeOf: (subtotalCents: number) => number;
  /** Comissão da Webag sobre `subtotal - desconto da loja` (RN-10), no subtotal pedido. */
  commissionOf: (subtotalCents: number, storeDiscountCents: number) => number;
  /** Custo previsto do motoboy da faixa (retirada: 0). */
  courierCostCents: number;
  /** `autofin_teto_pct` (padrão 50). */
  autofinTetoPct: number;
  /** `cupom_total_minimo_cents`. */
  minTotalCents: number;
}

export interface Composition {
  ok: true;
  grossCents: number;
  storeCents: number;
  webagCents: number;
  /** Quanto o desconto da Webag foi cortado pelos tetos (RN-09 ou total mínimo); 0 = inteiro. */
  webagCutCents: number;
  /** `application_fee` antes do cupom (comissão + entrega + serviço): o teto da RN-09. */
  applicationFeeCents: number;
  /** RN-C3: comissão + taxa de serviço + taxa de entrega - custo previsto do motoboy (pode ser negativa). */
  marginCents: number;
  /** Quanto sobra para a Webag no pedido depois do desconto dela (margem - desconto Webag); negativo = prejuízo. */
  remainingCents: number;
  totalCents: number;
  minimumTotalApplied: boolean;
}

export type CompositionRefusal = { ok: false; reason: 'UNAVAILABLE' | 'SHORTFALL'; grossCents: number; marginCents: number };

/** Desconto "de face" antes de qualquer teto: percentual com teto em R$, fixo, ou a própria entrega (frete grátis); nunca acima do subtotal (ou da entrega). */
export function grossDiscount(rule: CompositionRule, subtotalCents: number, deliveryFeeCents: number): number {
  switch (rule.kind) {
    case 'percent': {
      const raw = roundHalfUp(subtotalCents * rule.value, 100);
      return Math.min(rule.percentCapCents === null ? raw : Math.min(raw, rule.percentCapCents), subtotalCents);
    }
    case 'fixed':
      return Math.min(rule.value, subtotalCents);
    case 'free_shipping':
      return deliveryFeeCents;
  }
}

/**
 * Compõe o desconto. Autofinanciado é TUDO OU NADA (CDC art. 30): acima do teto da margem recusa (`SHORTFALL`, o total não muda) e com margem <= 0 recusa
 * (`UNAVAILABLE`); NUNCA é reduzido pelo total mínimo (R11). Nas demais fontes a parte da Webag corta no teto da RN-09 e depois no total mínimo
 * (primeiro a Webag, depois a loja).
 */
export function composeDiscount(rule: CompositionRule, order: CompositionOrder): Composition | CompositionRefusal {
  const { subtotalCents, deliveryFeeCents } = order;
  const serviceFee = order.serviceFeeOf(subtotalCents);
  const gross = grossDiscount(rule, subtotalCents, deliveryFeeCents);
  const share = rule.funding === 'store' ? 100 : rule.funding === 'split' ? rule.storeSharePct : 0;
  let store = roundHalfUp(gross * share, 100);
  let webag = gross - store;
  const commission = order.commissionOf(subtotalCents, store);
  const applicationFee = commission + deliveryFeeCents + serviceFee;
  const margin = applicationFee - order.courierCostCents;

  let cut = 0;
  if (rule.funding === 'self_funded') {
    if (margin <= 0) return { ok: false, reason: 'UNAVAILABLE', grossCents: gross, marginCents: margin };
    const cap = Math.floor((order.autofinTetoPct * margin) / 100);
    if (webag > cap) return { ok: false, reason: 'SHORTFALL', grossCents: gross, marginCents: margin };
  } else if (webag > applicationFee) {
    cut = webag - applicationFee;
    webag = applicationFee;
  }

  let total = subtotalCents - store - webag + deliveryFeeCents + serviceFee;
  let minimumTotalApplied = false;
  if (store + webag > 0 && total < order.minTotalCents) {
    if (rule.funding === 'self_funded') return { ok: false, reason: 'UNAVAILABLE', grossCents: gross, marginCents: margin };
    let lack = order.minTotalCents - total;
    const fromWebag = Math.min(lack, webag);
    webag -= fromWebag;
    cut += fromWebag;
    lack -= fromWebag;
    store -= lack;
    total = order.minTotalCents;
    minimumTotalApplied = true;
  }
  return { ok: true, grossCents: store + webag + cut, storeCents: store, webagCents: webag, webagCutCents: cut, applicationFeeCents: applicationFee, marginCents: margin, remainingCents: margin - webag, totalCents: total, minimumTotalApplied };
}

/** Limite da busca do "Faltam R$ X": acima de R$ 10.000,00 de sacola o cupom é "não disponível" (D5). */
export const SHORTFALL_SEARCH_LIMIT_CENTS = 1_000_000;

/**
 * "Quanto falta": o MENOR subtotal que libera o desconto do autofinanciado (busca binária em centavos), com a verificação final do R12:
 * `s*` precisa ser viável e `s* - 1` inviável; se a função não for monótona nesse ponto (percentual sem teto acima da margem: o desconto cresce mais rápido que a margem),
 * devolve `null` ("não disponível") em vez de um número errado. A busca parte do subtotal ATUAL da sacola (`fromSubtotalCents`): o "Faltam" é a diferença para o achado, mínimo R$ 0,01.
 */
export function minSubtotalForSelfFunded(rule: CompositionRule, order: Omit<CompositionOrder, 'subtotalCents'>, minOrderCents: number, fromSubtotalCents = 0): number | null {
  // Viável = a composição fecha E o desconto vale inteiro (o fixo nunca é truncado pelo subtotal: "Faltam" é sobre cobrir o valor cheio).
  const viable = (s: number): boolean => composeDiscount(rule, { ...order, subtotalCents: s }).ok && (rule.kind !== 'fixed' || s >= rule.value);
  const lo0 = Math.max(1, minOrderCents, fromSubtotalCents);
  if (viable(lo0)) return lo0;
  if (!viable(SHORTFALL_SEARCH_LIMIT_CENTS)) return null;
  let lo = lo0;
  let hi = SHORTFALL_SEARCH_LIMIT_CENTS;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (viable(mid)) hi = mid;
    else lo = mid;
  }
  return viable(hi) && !viable(hi - 1) ? hi : null;
}

/** "Faltam R$ X": sempre pelo menos 1 centavo (PRD WB-341 C3). */
export const shortfallCents = (neededSubtotalCents: number, currentSubtotalCents: number): number => Math.max(1, neededSubtotalCents - currentSubtotalCents);
