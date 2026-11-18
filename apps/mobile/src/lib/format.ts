const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valores da API vêm em centavos ({ amount: 1990, currency: "BRL" }). Zero vira "Grátis" (onda-3 §0.8). */
export function formatMoney(cents: number, opts: { freeLabel?: boolean } = {}): string {
  if (cents === 0 && opts.freeLabel) return 'Grátis';
  // NBSP entre R$ e o número vira espaço normal: leitores de tela e testes leem igual.
  return currency.format(cents / 100).replace(/ /g, ' ');
}

/** "14:47" a partir de epoch ms. Espera por tentativas aparece como horário, não contagem regressiva (onda-1b §0.2). */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 60 -> "1:00". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
