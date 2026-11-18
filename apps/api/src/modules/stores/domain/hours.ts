import { localParts } from './business-days.js';

/** Intervalo em minutos desde 00:00 local. Início inclusivo, fim EXCLUSIVO (às 12:00 já está fechada; R-16a). */
export interface Interval {
  startMin: number;
  endMin: number;
}

export interface WeeklyHours {
  /** Índice 0 = domingo ... 6 = sábado. Lista vazia = fechado o dia todo. */
  [weekday: number]: Interval[];
}

/** O último fim é 23:59: intervalo não atravessa a meia-noite (R-16b). */
export const MAX_END_MIN = 23 * 60 + 59;

export function validateDayIntervals(intervals: Interval[]): string | null {
  if (intervals.length > 2) return 'No máximo 2 intervalos por dia.';
  for (const i of intervals) {
    if (!Number.isInteger(i.startMin) || !Number.isInteger(i.endMin) || i.startMin < 0 || i.endMin > MAX_END_MIN) return 'Horário inválido.';
    if (i.endMin <= i.startMin) return 'O fim precisa ser depois do início.';
  }
  const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin);
  if (sorted.length === 2 && sorted[0]!.endMin > sorted[1]!.startMin) return 'Os intervalos não podem se sobrepor.';
  return null;
}

export interface OpenState {
  hours: WeeklyHours;
  holidays: ReadonlySet<string>;
  pausedUntil: Date | null;
  pausedIndefinitely: boolean;
}

/** "Aberta agora" (RN-03): no horário do dia, sem pausa ativa e fora de feriado marcado. */
export function isOpenNow(state: OpenState, now: Date): boolean {
  if (state.pausedIndefinitely) return false;
  if (state.pausedUntil && state.pausedUntil.getTime() > now.getTime()) return false;
  const { weekday, minuteOfDay, isoDate } = localParts(now);
  if (state.holidays.has(isoDate)) return false;
  return (state.hours[weekday] ?? []).some((i) => minuteOfDay >= i.startMin && minuteOfDay < i.endMin);
}

export type PauseKind = '30m' | '1h' | '2h' | 'end_of_day' | 'until_resume';

/** Fim do dia local = 23:59:59.999 BRT do dia corrente. */
export function pauseUntil(kind: PauseKind, now: Date): { pausedUntil: Date | null; pausedIndefinitely: boolean } {
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
