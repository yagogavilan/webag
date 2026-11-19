/** Menor faixa mostrada ao cliente (evita "chega entre 0 e 20 min"). */
export const MIN_ETA_FROM_MIN = 5;
export function computeEta(config, input) {
    const prepMin = input.prepMin ?? config.defaultPrepMin;
    const travelMin = Math.ceil(((input.distanceM / 1000) * (config.routeFactorPct / 100) * config.minPerKm) - 1e-9);
    const estimateMin = prepMin + config.dispatchMin + travelMin;
    return {
        estimateMin,
        fromMin: Math.max(MIN_ETA_FROM_MIN, estimateMin - config.bandMin),
        toMin: estimateMin + config.bandMin,
        prepMin,
        dispatchMin: config.dispatchMin,
        travelMin,
        withinCeiling: estimateMin + config.bandMin <= config.maxMin,
    };
}
/** Distância máxima (m) cujo FIM da faixa ainda cabe no teto (DEC-054) para uma loja com este preparo; `0` se nem o preparo cabe. */
export function maxDistanceForCeilingM(config, prepMin) {
    const room = config.maxMin - config.bandMin - (prepMin ?? config.defaultPrepMin) - config.dispatchMin;
    const perKm = (config.routeFactorPct / 100) * config.minPerKm;
    if (room <= 0 || perKm <= 0)
        return 0;
    return Math.floor((room / perKm) * 1000);
}
/** Faixa em horário de relógio a partir de `now` ("Chega entre 15:40 e 16:40"). */
export function etaWindow(estimate, now) {
    return { fromAt: new Date(now.getTime() + estimate.fromMin * 60_000), toAt: new Date(now.getTime() + estimate.toMin * 60_000) };
}
export function presentEta(range, now) {
    const window = etaWindow({ fromMin: range.minMinutes, toMin: range.maxMinutes }, now);
    return { minMinutes: range.minMinutes, maxMinutes: range.maxMinutes, fromAt: window.fromAt.toISOString(), toAt: window.toAt.toISOString() };
}
//# sourceMappingURL=eta.js.map