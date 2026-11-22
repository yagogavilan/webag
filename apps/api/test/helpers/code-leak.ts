/**
 * BUG-047: o código de entrega tem 4 dígitos e `toContain` num JSON ou texto inteiro dá falso positivo (a sequência aparece num UUID, num telefone ou num id) em ~1% das execuções.
 * Aqui o código só conta como vazado se aparece como "palavra" isolada: sem letra, dígito ou hífen colado (um UUID tem hífen e hexadecimal ao redor).
 */
export function leaksCode(text: unknown, code: string): boolean {
  const haystack = typeof text === 'string' ? text : JSON.stringify(text);
  return new RegExp(`(?<![0-9A-Za-z-])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9A-Za-z-])`).test(haystack);
}
