/**
 * Horário da logística da Webag (BUG-016, WB-230 C6, RN-18, DEC-039c): "uma pessoa não despacha 24 h". Fora do horário, ou com a
 * logística pausada pelo admin, a entrega não é oferecida (só retirada) e o app mostra "Entrega volta às HH:MM".
 * Horário de Brasília (UTC-3, sem horário de verão desde 2019); a janela é `HH:MM-HH:MM` (início inclusivo, fim exclusivo).
 */
export const LOGISTICS_DAYS = ['seg_sab', 'seg_sex', 'seg_dom'] as const;
export type LogisticsDays = (typeof LOGISTICS_DAYS)[number];

export interface LogisticsHours {
  /** `HH:MM-HH:MM` */
  window: string;
  days: LogisticsDays;
}

const BRT_OFFSET_MS = -3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Dias da semana (0 = domingo) em que a logística abre. */
const OPEN_WEEKDAYS: Record<LogisticsDays, readonly number[]> = {
  seg_sab: [1, 2, 3, 4, 5, 6],
  seg_sex: [1, 2, 3, 4, 5],
  seg_dom: [0, 1, 2, 3, 4, 5, 6],
};

function parseWindow(window: string): { startMin: number; endMin: number } {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(window);
  if (!match) return { startMin: 9 * 60, endMin: 20 * 60 };
  return { startMin: Number(match[1]) * 60 + Number(match[2]), endMin: Number(match[3]) * 60 + Number(match[4]) };
}

/** Relógio de parede de Brasília de um instante UTC (campos UTC do deslocado). */
function brt(now: Date): { weekday: number; minutes: number; dayStartUtc: number } {
  const local = new Date(now.getTime() + BRT_OFFSET_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const dayStartUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BRT_OFFSET_MS;
  return { weekday: local.getUTCDay(), minutes, dayStartUtc };
}

export function isLogisticsOpen(hours: LogisticsHours, now: Date): boolean {
  const { startMin, endMin } = parseWindow(hours.window);
  const { weekday, minutes } = brt(now);
  return OPEN_WEEKDAYS[hours.days].includes(weekday) && minutes >= startMin && minutes < endMin;
}

/** Próxima abertura a partir de `now` (nunca antes dele); procura nos próximos 8 dias. */
export function nextLogisticsOpening(hours: LogisticsHours, now: Date): Date {
  const { startMin } = parseWindow(hours.window);
  const today = brt(now);
  for (let offset = 0; offset <= 8; offset += 1) {
    const dayStart = today.dayStartUtc + offset * DAY_MS;
    const weekday = new Date(dayStart + BRT_OFFSET_MS + 12 * 3_600_000).getUTCDay();
    if (!OPEN_WEEKDAYS[hours.days].includes(weekday)) continue;
    const opening = new Date(dayStart + startMin * 60_000);
    if (opening.getTime() > now.getTime()) return opening;
  }
  return new Date(now.getTime() + DAY_MS);
}
