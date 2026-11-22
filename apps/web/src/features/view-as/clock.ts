/** Relógio da visão (WB-352 C1, C11): tempo ABSOLUTO até `expiresAt`; só a tela muda, quem corta é a API. */
export const FIVE_MIN_MS = 5 * 60_000;
export const ONE_MIN_MS = 60_000;

export type ClockPhase = 'normal' | 'attention' | 'last-minute' | 'ended';

export function phaseOf(remainingMs: number): ClockPhase {
  if (remainingMs <= 0) return 'ended';
  if (remainingMs <= ONE_MIN_MS) return 'last-minute';
  if (remainingMs <= FIVE_MIN_MS) return 'attention';
  return 'normal';
}

/** "Restam 28 min" (minutos cheios, sem contar para baixo antes da hora) e, no último minuto, "Restam 0:45". */
export function clockText(remainingMs: number): string {
  if (remainingMs <= ONE_MIN_MS) return `Restam 0:${String(Math.max(Math.ceil(remainingMs / 1000), 0)).padStart(2, '0')}`;
  return `Restam ${Math.ceil(remainingMs / 60_000)} min`;
}

/** Rótulo do `role=timer` (o leitor de tela lê a duração por extenso). */
export function clockLabel(remainingMs: number): string {
  if (remainingMs <= ONE_MIN_MS) {
    const seconds = Math.max(Math.ceil(remainingMs / 1000), 0);
    return `Tempo restante da visualização: ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
  }
  const minutes = Math.ceil(remainingMs / 60_000);
  return `Tempo restante da visualização: ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

export const WARNING_TEXT = { attention: 'A visualização fecha em 5 minutos.', 'last-minute': 'A visualização fecha em 1 minuto.' } as const;
