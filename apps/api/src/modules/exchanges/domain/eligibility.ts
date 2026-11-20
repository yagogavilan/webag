/**
 * Elegibilidade e prazos da troca (RN-11, DEC-037). Funções puras: o prazo conta da ENTREGA confirmada (nunca do pedido) e é
 * calculado em milissegundos corridos. O piso legal (arrependimento e defeito) é FIXO: não vem de parâmetro editável.
 */
export const EXCHANGE_TYPES = ['withdrawal', 'defect', 'size_color'] as const;
export type ExchangeType = (typeof EXCHANGE_TYPES)[number];

/** CDC art. 49 (arrependimento), art. 26 (defeito: 30 dias não durável, 90 durável): pisos fixos no código. */
export const LEGAL_FLOOR_DAYS = { withdrawal: 7, defect: 30, defectDurable: 90 } as const;

export const DAY_MS = 86_400_000;

export interface EligibilityInput {
  type: ExchangeType;
  /** Entrega confirmada (corrida entregue ou retirada concluída). `null` = ainda não entregue. */
  deliveredAt: Date | null;
  now: Date;
  /** Prazo da loja para tamanho/cor (dias; 0 = não aceita) já validado dentro de mínimo e máximo do admin. */
  storeVoluntaryDays: number;
  /** Produto marcado "sem troca voluntária" (sob medida, personalizado, íntimo, higiene). */
  productNoVoluntaryExchange: boolean;
  /** Categoria durável (defeito em 90 dias). Padrão `true` para vestuário e calçado [HIPÓTESE; jurídico]. */
  productDurable: boolean;
  /** Trocas voluntárias já feitas no pedido e o limite (`troca_voluntaria_max_por_pedido`). */
  voluntaryExchangesInOrder: number;
  voluntaryLimitPerOrder: number;
  /** O item já foi trocado antes (troca de item trocado só por defeito). */
  itemAlreadyExchanged: boolean;
  /** Já existe solicitação aberta para o item. */
  openRequestForItem: boolean;
}

export type EligibilityReason = 'NOT_DELIVERED' | 'OPEN_REQUEST' | 'WINDOW_EXPIRED' | 'STORE_NO_VOLUNTARY' | 'PRODUCT_NO_VOLUNTARY' | 'VOLUNTARY_LIMIT' | 'ALREADY_EXCHANGED';

export type Eligibility = { eligible: true; deadline: Date; days: number } | { eligible: false; reason: EligibilityReason; deadline: Date | null };

/** Prazo em dias do tipo; `0` = o tipo não existe para esta loja/produto. */
export function windowDays(input: Pick<EligibilityInput, 'type' | 'productDurable' | 'storeVoluntaryDays'>): number {
  if (input.type === 'withdrawal') return LEGAL_FLOOR_DAYS.withdrawal;
  if (input.type === 'defect') return input.productDurable ? LEGAL_FLOOR_DAYS.defectDurable : LEGAL_FLOOR_DAYS.defect;
  return input.storeVoluntaryDays;
}

export function evaluateEligibility(input: EligibilityInput): Eligibility {
  if (!input.deliveredAt) return { eligible: false, reason: 'NOT_DELIVERED', deadline: null };
  if (input.openRequestForItem) return { eligible: false, reason: 'OPEN_REQUEST', deadline: null };
  if (input.type === 'size_color') {
    if (input.storeVoluntaryDays <= 0) return { eligible: false, reason: 'STORE_NO_VOLUNTARY', deadline: null };
    if (input.productNoVoluntaryExchange) return { eligible: false, reason: 'PRODUCT_NO_VOLUNTARY', deadline: null };
    if (input.itemAlreadyExchanged) return { eligible: false, reason: 'ALREADY_EXCHANGED', deadline: null };
    if (input.voluntaryExchangesInOrder >= input.voluntaryLimitPerOrder) return { eligible: false, reason: 'VOLUNTARY_LIMIT', deadline: null };
  }
  const days = windowDays(input);
  const deadline = new Date(input.deliveredAt.getTime() + days * DAY_MS);
  if (input.now.getTime() > deadline.getTime()) return { eligible: false, reason: 'WINDOW_EXPIRED', deadline };
  return { eligible: true, deadline, days };
}

/** Quem resolve o pedido da troca (RN-11): arrependimento é automático e imediato; os demais, a loja em `troca_resposta_h`. */
export const approvalMode = (type: ExchangeType): 'automatic' | 'store' => (type === 'withdrawal' ? 'automatic' : 'store');

/** Sem resposta da loja no SLA, a troca é aprovada pelo sistema (DEC-037). */
export function storeAnswerDeadline(requestedAt: Date, slaHours: number): Date {
  return new Date(requestedAt.getTime() + slaHours * 3_600_000);
}
export const isSlaExpired = (requestedAt: Date, slaHours: number, now: Date): boolean => now.getTime() >= storeAnswerDeadline(requestedAt, slaHours).getTime();

/**
 * Cobrança da coleta (HIP-D09/HIP-T05): arrependimento e defeito nunca cobram do cliente (a Webag cobre); tamanho/cor cobra a
 * taxa de troca da tabela SÓ depois da aprovação e só na coleta em casa (levar à loja é grátis).
 */
export function collectionFeeCents(input: { type: ExchangeType; method: 'pickup_at_home' | 'drop_at_store'; tableExchangeFeeCents: number; approved: boolean }): number {
  if (input.type !== 'size_color' || input.method === 'drop_at_store' || !input.approved) return 0;
  return input.tableExchangeFeeCents;
}

/** Diferença de preço da reposição: positiva = o cliente paga; negativa = a Webag estorna (WB-245). */
export const priceDifferenceCents = (newVariantCurrentPriceCents: number, originalPaidUnitCents: number): number => newVariantCurrentPriceCents - originalPaidUnitCents;

/** Reembolso de arrependimento inclui a taxa de entrega paga (CDC art. 49 + Decreto 7.962/2013); defeito e tamanho/cor só os itens. */
export function refundCents(input: { type: ExchangeType; itemsCents: number; deliveryFeePaidCents: number }): number {
  return input.type === 'withdrawal' ? input.itemsCents + input.deliveryFeePaidCents : input.itemsCents;
}
