import { formatClock } from '@/lib/format';
import type { StoreSettings } from '@/lib/api/store-settings';

/**
 * Estado único da loja para o Início e para Minha loja (V8.5): o servidor diz se está aberta (`isOpenNow`) e se está pausada
 * (`pause`); o painel só escreve o texto. Aberta mostra "Pausar"; fechada pelo horário NÃO oferece pausar (não se pausa o que
 * já está fechado); pausada mostra "Voltar a vender".
 */
export type StoreState = 'open' | 'closed_by_hours' | 'paused';

export interface StoreStatus {
  state: StoreState;
  /** "Aberta · fecha às 18:00", "Fechada pelo horário · abre amanhã às 09:00" ou "Pausada até 15:30". */
  text: string;
}

const ZONE = 'America/Sao_Paulo';
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const localParts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const pad = (value: string): string => (value.length === 4 ? `0${value}` : value);

function nowLocal(at: Date): { ymd: string; minutes: number } {
  const parts = Object.fromEntries(localParts.formatToParts(at).map((p) => [p.type, p.value]));
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const toMinutes = (clock: string): number => {
  const [h, m] = clock.split(':');
  return Number(h) * 60 + Number(m);
};

/** Hora de fechar do intervalo em que a loja está agora, ou `null`. */
export function closesAt(hours: StoreSettings['hours'], at: Date): string | null {
  const { ymd, minutes } = nowLocal(at);
  const weekday = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const interval = hours.find((day) => day.weekday === weekday)?.intervals.find((item) => toMinutes(item.start) <= minutes && minutes < toMinutes(item.end));
  return interval ? pad(interval.end) : null;
}

/** Próxima abertura ("às 09:00", "amanhã às 09:00", "sexta às 09:00") pelo horário semanal, pulando os feriados; `null` sem horário. */
export function nextOpening(settings: Pick<StoreSettings, 'hours' | 'holidays'>, at: Date): string | null {
  const { ymd, minutes } = nowLocal(at);
  const holidays = new Set(settings.holidays.map((h) => h.date));
  const base = new Date(`${ymd}T12:00:00Z`);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(base.getTime() + offset * 86_400_000);
    if (holidays.has(day.toISOString().slice(0, 10))) continue;
    const starts = (settings.hours.find((d) => d.weekday === day.getUTCDay())?.intervals ?? []).map((i) => i.start).sort();
    const start = offset === 0 ? starts.find((s) => toMinutes(s) > minutes) : starts[0];
    if (!start) continue;
    const when = offset === 0 ? '' : offset === 1 ? 'amanhã ' : `${DAY_NAMES[day.getUTCDay()]} `;
    return `${when}às ${pad(start)}`;
  }
  return null;
}

export function storeStatus(settings: StoreSettings, at: Date = new Date()): StoreStatus {
  if (settings.pause.active) {
    if (settings.pause.indefinitely || !settings.pause.until) return { state: 'paused', text: 'Pausada até você voltar a vender' };
    return { state: 'paused', text: `Pausada até ${formatClock(settings.pause.until)}` };
  }
  if (settings.isOpenNow) {
    const closes = closesAt(settings.hours, at);
    return { state: 'open', text: closes ? `Aberta · fecha às ${closes}` : 'Aberta' };
  }
  const opens = nextOpening(settings, at);
  return { state: 'closed_by_hours', text: opens ? `Fechada pelo horário · abre ${opens}` : 'Fechada pelo horário' };
}
