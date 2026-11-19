/**
 * DEC-053: a promessa é "em até 2 h" conforme a distância, mostrada como FAIXA ("Chega entre 15:40 e 16:40"), nunca número único.
 * A API manda a faixa em minutos (`etaMinMinutes`/`etaMaxMinutes`); o app a ancora no relógio (agora, ou o horário do pedido).
 */
export const MAX_ETA_MINUTES = 120;
const STEP = 5;

const clock = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Janela em horários cheios de 5 min (início arredondado para baixo, fim para cima), para a faixa não "dançar" a cada minuto. */
export function etaWindow(minMinutes: number, maxMinutes: number, from: Date = new Date()): { start: string; end: string } {
  const base = from.getTime();
  const floor = (ms: number) => Math.floor(ms / (STEP * 60_000)) * STEP * 60_000;
  const ceil = (ms: number) => Math.ceil(ms / (STEP * 60_000)) * STEP * 60_000;
  const lo = Math.min(minMinutes, maxMinutes);
  const hi = Math.max(minMinutes, maxMinutes);
  return { start: clock(new Date(floor(base + lo * 60_000))), end: clock(new Date(ceil(base + hi * 60_000))) };
}

/** "Chega entre 15:40 e 16:40". */
export function formatEtaBand(minMinutes: number, maxMinutes: number, from?: Date): string {
  const { start, end } = etaWindow(minMinutes, maxMinutes, from);
  return `Chega entre ${start} e ${end}`;
}

/** "15:40 – 16:40" para chip e herói. */
export function formatEtaRange(minMinutes: number, maxMinutes: number, from?: Date): string {
  const { start, end } = etaWindow(minMinutes, maxMinutes, from);
  return `${start} – ${end}`;
}

/** Loja que passa do teto de 120 min para o endereço não entrega lá ("fora da área"). */
export function isBeyondReach(delivery: { available: boolean; etaMaxMinutes: number }): boolean {
  return !delivery.available || delivery.etaMaxMinutes > MAX_ETA_MINUTES;
}

export interface EtaLike {
  fromAt: string;
  toAt: string;
}

export interface DeliveryEtaSource {
  etaMinMinutes: number;
  etaMaxMinutes: number;
  /** Faixa calculada pelo servidor (DEC-053); aditivo: apps/servidores sem o campo caem na conta local. */
  eta?: EtaLike | null | undefined;
  available?: boolean | null | undefined;
}

const clockOf = (iso: string): string | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : clock(d);
};

/**
 * Faixa de chegada de uma loja/pedido: a do servidor (`eta.fromAt`/`toAt`) quando existe; senão âncora local (agora + minutos).
 * `null` = fora da área (o servidor diz `available=false`).
 */
export function deliveryEta(d: DeliveryEtaSource, from?: Date): { start: string; end: string } | null {
  if (d.available === false) return null;
  if (d.eta) {
    const start = clockOf(d.eta.fromAt);
    const end = clockOf(d.eta.toAt);
    if (start && end) return { start, end };
  }
  if (d.etaMaxMinutes > MAX_ETA_MINUTES) return null;
  return etaWindow(d.etaMinMinutes, d.etaMaxMinutes, from);
}

/** Lê `eta` (aditivo no contrato, DEC-053) de qualquer objeto da API, sem depender de o tipo gerado já ter o campo. */
export function readEta(source: unknown): EtaLike | null {
  const eta = (source as { eta?: EtaLike | null } | null | undefined)?.eta;
  return eta && typeof eta.fromAt === 'string' && typeof eta.toAt === 'string' ? eta : null;
}

/** "Chega entre 15:40 e 16:40" a partir da faixa do servidor, ou da conta local (agora + minutos). `null` = fora da área. */
export function etaLabel(d: DeliveryEtaSource, from?: Date): string | null {
  const w = deliveryEta(d, from);
  return w ? `Chega entre ${w.start} e ${w.end}` : null;
}
