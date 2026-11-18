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
