const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const full = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "18 nov., 10:42" (fuso de Brasília). */
export function formatDateTime(iso: string | Date): string {
  return dateTime.format(new Date(iso)).replace(/\./g, '');
}
export function formatFullDateTime(iso: string | Date): string {
  return full.format(new Date(iso)).replace(/\./g, '');
}
export function formatDay(iso: string | Date): string {
  return day.format(new Date(iso)).replace(/\./g, '');
}
/** "14:47" para "Tente de novo às 14:47" (horário, não contagem regressiva). */
export function formatClock(iso: string | Date): string {
  return clock.format(new Date(iso));
}
export function clockAfterSeconds(seconds: number, now: Date = new Date()): string {
  return formatClock(new Date(now.getTime() + seconds * 1000));
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

/** Valor de `<input type="datetime-local">` (hora local) a partir de um instante ISO. */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Instante ISO (UTC) a partir do valor de `<input type="datetime-local">`; `null` se vazio ou inválido. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Percentual com 1 casa e vírgula ("6,9%"). */
export function formatPct(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : `${value.toFixed(1).replace('.', ',')}%`;
}
