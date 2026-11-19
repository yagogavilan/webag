/** Dia útil = segunda a sexta, sem feriados na 1.0 (R-15a). O fuso é America/Sao_Paulo (UTC-3, sem horário de verão desde 2019). */
const BRT_OFFSET_MS = -3 * 3_600_000;
/** Dia (0 = domingo) e minuto do dia na hora local de São Paulo. */
export function localParts(date) {
    const local = new Date(date.getTime() + BRT_OFFSET_MS);
    return {
        weekday: local.getUTCDay(),
        minuteOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(),
        isoDate: local.toISOString().slice(0, 10),
    };
}
/**
 * Prazo vencido? Conta dias úteis cheios entre `start` e `now` com o mesmo horário de relógio: enviada sexta 17:00
 * vence terça 17:00, não domingo (O2-APR-02). Os dias úteis do "meio" são contados pelo calendário local.
 */
export function businessDeadline(start, businessDays) {
    let cursor = new Date(start.getTime());
    let remaining = businessDays;
    while (remaining > 0) {
        cursor = new Date(cursor.getTime() + 86_400_000);
        const { weekday } = localParts(cursor);
        if (weekday !== 0 && weekday !== 6)
            remaining--;
    }
    return cursor;
}
export const isOverdue = (start, businessDays, now) => now.getTime() > businessDeadline(start, businessDays).getTime();
//# sourceMappingURL=business-days.js.map