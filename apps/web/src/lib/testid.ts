/** Padrão de rótulo de teste do painel: `admin.<tela>.<elemento>` (onda-2 §0.4; onda-1b Parte C e D). */
export function tid(screen: string, id: string): string {
  return `admin.${screen}.${id}`;
}
