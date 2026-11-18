/**
 * Data e hora de promoção. O Brasil não tem horário de verão desde 2019, então Brasília é UTC-3 o ano todo (a API
 * também fixa -03:00 ao ler a planilha). O campo do navegador entrega "2026-11-20T08:00" sem fuso.
 */
const OFFSET_MS = 3 * 3_600_000;

/** "2026-11-20T08:00" (Brasília) para ISO UTC. `null` se vazio ou inválido. */
export function localToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO UTC para o valor do campo `datetime-local`, em Brasília. */
export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  return new Date(time - OFFSET_MS).toISOString().slice(0, 16);
}
