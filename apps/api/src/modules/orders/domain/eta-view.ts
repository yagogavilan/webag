/** Faixa de chegada do pedido (DEC-053), no formato do contrato; `null` em pedido anterior à regra ou sem entrega. */
export function etaOfOrder(order: { etaMinMinutes: number; etaMaxMinutes: number; etaFromAt: Date | null; etaToAt: Date | null }) {
  if (!order.etaFromAt || !order.etaToAt) return null;
  return { minMinutes: order.etaMinMinutes, maxMinutes: order.etaMaxMinutes, fromAt: order.etaFromAt.toISOString(), toAt: order.etaToAt.toISOString() };
}

/**
 * W.8 / DEC-064 (c) / HIP-P05: "Marque 'pronto' até HH:MM" para a loja = pagamento aprovado + preparo da loja (o mesmo preparo que entrou na
 * faixa de chegada do cliente: RN-19 item 3 conta o preparo a partir do pagamento). Entrega: o `prepMin` gravado no pedido (snapshot da estimativa);
 * retirada: o fim da janela de preparo informada ao cliente (`prepMaxMinutes`) `[HIPÓTESE; a RN só define a fórmula da entrega]`. Só enquanto a loja
 * ainda não marcou "pronto" (recebido, aceito, em preparo); nulo depois, em pedido sem pagamento ou anterior à DEC-053 (sem preparo gravado).
 */
export function readyByAtOf(order: { status: string; mode: 'delivery' | 'pickup'; paidAt: Date | null; deliverySnapshot: unknown; pickup: { prepMaxMinutes: number } | null }): string | null {
  if (!order.paidAt || !['received', 'accepted', 'in_preparation'].includes(order.status)) return null;
  const snapshotPrep = (order.deliverySnapshot as { eta?: { prepMin?: unknown } | null } | null)?.eta?.prepMin;
  const prepMin = order.mode === 'delivery' ? (typeof snapshotPrep === 'number' ? snapshotPrep : null) : (order.pickup?.prepMaxMinutes ?? null);
  return prepMin === null ? null : new Date(order.paidAt.getTime() + prepMin * 60_000).toISOString();
}
