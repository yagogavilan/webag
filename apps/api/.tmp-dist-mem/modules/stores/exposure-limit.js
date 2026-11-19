const DAY_MS = 86_400_000;
/**
 * WB-225 / DEC-020b: loja nova tem teto por pedido (padrão R$ 500) até completar 30 dias da aprovação OU 20 pedidos entregues,
 * o que vier primeiro. `released` (admin) tira o limite; `custom` troca só o teto. Pura: o relógio entra por parâmetro.
 */
export function evaluateExposureLimit(input) {
    const endsAt = new Date(input.since.getTime() + input.params.days * DAY_MS);
    const ordersToEnd = Math.max(0, input.params.orders - input.deliveredOrders);
    const base = { deliveredOrders: input.deliveredOrders, mode: input.mode };
    if (input.mode === 'released')
        return { ...base, active: false, maxOrderCents: null, endsAt: null, ordersToEnd: null };
    const active = input.now.getTime() < endsAt.getTime() && input.deliveredOrders < input.params.orders;
    const max = input.mode === 'custom' && input.customMaxCents !== null ? input.customMaxCents : input.params.maxOrderCents;
    return { ...base, active, maxOrderCents: active ? max : null, endsAt, ordersToEnd };
}
//# sourceMappingURL=exposure-limit.js.map