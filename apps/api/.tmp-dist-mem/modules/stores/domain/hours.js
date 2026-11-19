import { localParts } from './business-days.js';
/** O último fim é 23:59: intervalo não atravessa a meia-noite (R-16b). */
export const MAX_END_MIN = 23 * 60 + 59;
export function validateDayIntervals(intervals) {
    if (intervals.length > 2)
        return 'No máximo 2 intervalos por dia.';
    for (const i of intervals) {
        if (!Number.isInteger(i.startMin) || !Number.isInteger(i.endMin) || i.startMin < 0 || i.endMin > MAX_END_MIN)
            return 'Horário inválido.';
        if (i.endMin <= i.startMin)
            return 'O fim precisa ser depois do início.';
    }
    const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin);
    if (sorted.length === 2 && sorted[0].endMin > sorted[1].startMin)
        return 'Os intervalos não podem se sobrepor.';
    return null;
}
/** "Aberta agora" (RN-03): no horário do dia, sem pausa ativa e fora de feriado marcado. */
export function isOpenNow(state, now) {
    if (state.pausedIndefinitely)
        return false;
    if (state.pausedUntil && state.pausedUntil.getTime() > now.getTime())
        return false;
    const { weekday, minuteOfDay, isoDate } = localParts(now);
    if (state.holidays.has(isoDate))
        return false;
    return (state.hours[weekday] ?? []).some((i) => minuteOfDay >= i.startMin && minuteOfDay < i.endMin);
}
/** Fim do dia local = 23:59:59.999 BRT do dia corrente. */
export function pauseUntil(kind, now) {
    switch (kind) {
        case '30m':
            return { pausedUntil: new Date(now.getTime() + 30 * 60_000), pausedIndefinitely: false };
        case '1h':
            return { pausedUntil: new Date(now.getTime() + 60 * 60_000), pausedIndefinitely: false };
        case '2h':
            return { pausedUntil: new Date(now.getTime() + 120 * 60_000), pausedIndefinitely: false };
        case 'end_of_day': {
            const { isoDate } = localParts(now);
            return { pausedUntil: new Date(`${isoDate}T23:59:59.999-03:00`), pausedIndefinitely: false };
        }
        case 'until_resume':
            return { pausedUntil: null, pausedIndefinitely: true };
    }
}
//# sourceMappingURL=hours.js.map