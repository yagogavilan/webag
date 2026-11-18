/** Palavras suspeitas (WB-107 C3, R-12c): casa como PALAVRA INTEIRA, sem diferenciar caixa nem acento. */
export const normalizeWord = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function matchesSuspectWord(text: string, words: readonly string[]): string[] {
  const tokens = new Set(normalizeWord(text).split(/[^a-z0-9]+/).filter(Boolean));
  return words.map(normalizeWord).filter((word) => word !== '' && tokens.has(word));
}

/** 3 remoções da loja em 30 dias sinalizam análise de suspensão (WB-107 C4). */
export function shouldFlagForSuspension(removalDates: Date[], now: Date): boolean {
  const since = now.getTime() - 30 * 86_400_000;
  return removalDates.filter((d) => d.getTime() >= since).length >= 3;
}
