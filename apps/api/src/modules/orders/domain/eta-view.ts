/** Faixa de chegada do pedido (DEC-053), no formato do contrato; `null` em pedido anterior à regra ou sem entrega. */
export function etaOfOrder(order: { etaMinMinutes: number; etaMaxMinutes: number; etaFromAt: Date | null; etaToAt: Date | null }) {
  if (!order.etaFromAt || !order.etaToAt) return null;
  return { minMinutes: order.etaMinMinutes, maxMinutes: order.etaMaxMinutes, fromAt: order.etaFromAt.toISOString(), toAt: order.etaToAt.toISOString() };
}
