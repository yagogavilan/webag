import type { Rating } from '@webag/shared';
import { formatMoney } from '../../lib/format';

/** Formatos da spec (onda-3 §0.8): "1,2 km", "30 a 45 min", "4,8 · 120", "Grátis". */

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${decimal.format(meters / 1000)} km`;
}

export function formatEta(minMinutes: number, maxMinutes: number): string {
  return minMinutes === maxMinutes ? `${minMinutes} min` : `${minMinutes} a ${maxMinutes} min`;
}

/** Nota "4,8 · 120", ou "Novo" com menos de 3 avaliações (a API já manda `isNew`). */
export function formatRating(rating: Rating, newLabel = 'Novo'): string {
  if (rating.isNew || rating.average === null) return newLabel;
  return `${decimal.format(rating.average)} · ${rating.count}`;
}

/** Leitura falada da nota: "4,8 de 5, 120 avaliações". */
export function ratingA11y(rating: Rating): string {
  if (rating.isNew || rating.average === null) return 'Loja nova, ainda sem nota';
  return `${decimal.format(rating.average)} de 5, ${rating.count} ${rating.count === 1 ? 'avaliação' : 'avaliações'}`;
}

/** Taxa: "Grátis", "R$ 5,00" ou, com endereço só aproximado, "a partir de R$ 5,00" (onda-3 §0.7). */
export function formatFee(feeCents: number | null, opts: { approximate?: boolean } = {}): string | null {
  if (feeCents === null) return null;
  if (feeCents === 0) return 'Grátis';
  const value = formatMoney(feeCents);
  return opts.approximate ? `a partir de ${value}` : value;
}

const hourLabel = (d: Date): string => {
  const m = d.getMinutes();
  return m === 0 ? `${d.getHours()}h` : `${d.getHours()}h${String(m).padStart(2, '0')}`;
};

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "abre 9h", "abre amanhã às 9h", "abre quinta às 9h". Sem horário (pausada sem prazo): null. */
export function formatOpensAt(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  if (sameDay(at, now)) return `abre ${hourLabel(at)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(at, tomorrow)) return `abre amanhã às ${hourLabel(at)}`;
  const weekday = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][at.getDay()] ?? '';
  return `abre ${weekday} às ${hourLabel(at)}`;
}

/** "Fechada · abre 9h" ou só "Fechada". */
export function closedLabel(opensAt: string | null, now?: Date): string {
  const when = formatOpensAt(opensAt, now);
  return when ? `Fechada · ${when}` : 'Fechada';
}

/** "23 resultados". */
export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "18:00" do intervalo de hoje que contém agora (loja aberta); sem intervalo ativo: null. */
export function closesAtToday(hours: readonly { start: string; end: string }[], now: Date = new Date()): string | null {
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const active = hours.find((h) => h.start <= current && current < h.end);
  return active ? active.end : null;
}
