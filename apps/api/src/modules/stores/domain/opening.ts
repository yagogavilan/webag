import { isOpenNow, type WeeklyHours } from './hours.js';

const BRT_OFFSET_MS = -3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Dia local (0 = domingo), minuto do dia e data ISO local de São Paulo (UTC-3, sem horário de verão). */
function local(date: Date): { weekday: number; minuteOfDay: number; isoDate: string } {
  const shifted = new Date(date.getTime() + BRT_OFFSET_MS);
  return { weekday: shifted.getUTCDay(), minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), isoDate: shifted.toISOString().slice(0, 10) };
}

export interface OpeningInput {
  hours: WeeklyHours;
  holidays: ReadonlySet<string>;
  pausedUntil: Date | null;
  pausedIndefinitely: boolean;
}

const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Horários de hoje em "HH:MM" (vazio = fechada o dia todo, ou feriado marcado). */
export function hoursToday(input: OpeningInput, now: Date): { start: string; end: string }[] {
  const { weekday, isoDate } = local(now);
  if (input.holidays.has(isoDate)) return [];
  return [...(input.hours[weekday] ?? [])].sort((a, b) => a.startMin - b.startMin).map((i) => ({ start: hhmm(i.startMin), end: hhmm(i.endMin) }));
}

/**
 * Próxima abertura (instante UTC) ou `null` se não há nos próximos 7 dias. Respeita feriados e pausa: com pausa
 * indefinida não há previsão (o lojista retoma sozinho); pausa com prazo empurra a busca para depois do fim dela.
 */
export function nextOpening(input: OpeningInput, now: Date): Date | null {
  if (input.pausedIndefinitely) return null;
  const from = input.pausedUntil && input.pausedUntil.getTime() > now.getTime() ? input.pausedUntil : now;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(from.getTime() + offset * DAY_MS);
    const parts = local(day);
    if (input.holidays.has(parts.isoDate)) continue;
    const startOfLocalDayUtc = day.getTime() - parts.minuteOfDay * 60_000 - (day.getTime() % 60_000);
    for (const interval of [...(input.hours[parts.weekday] ?? [])].sort((a, b) => a.startMin - b.startMin)) {
      if (startOfLocalDayUtc + interval.endMin * 60_000 <= from.getTime()) continue;
      // Pausa que termina no meio do expediente: abre em `from`.
      return new Date(Math.max(startOfLocalDayUtc + interval.startMin * 60_000, from.getTime()));
    }
  }
  return null;
}

export const isOpen = (input: OpeningInput, now: Date): boolean => isOpenNow(input, now);
