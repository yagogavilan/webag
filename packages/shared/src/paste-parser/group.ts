import { stripAccents } from './vocab.js';
import type { PasteDraft, PasteGroupSuggestion } from './types.js';

function norm(value: string): string {
  return stripAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Nome-base e cor (DEC-128 #1): cor diferente é produto diferente, porque foto por cor está fora da v1.1 (WB-372 C7). */
function groupKey(draft: PasteDraft, name: string): string {
  const color = draft.colors.value.map(norm).sort().join('/');
  return `${norm(name)}|${color}`;
}

/**
 * Sugere "Juntar N linhas em 1 produto com variações" (WB-376 C10). Só sugere: o app decide com 1 toque e nunca junta sozinho.
 * Entram linhas com o mesmo nome-base E a mesma cor (ou nenhuma) e exatamente 1 tamanho e/ou 1 cor. Não sugere quando a mesma combinação aparece duas
 * vezes (a grade recusa combinação repetida, WB-374 C4). Preços diferentes viram preço por variação (`per_variant`).
 */
export function suggestGroups(drafts: readonly PasteDraft[]): PasteGroupSuggestion[] {
  const byKey = new Map<string, PasteDraft[]>();
  for (const draft of drafts) {
    const name = draft.baseName;
    if (!name) continue;
    const sizes = draft.sizes.value.length;
    const colors = draft.colors.value.length;
    if (sizes > 1 || colors > 1 || sizes + colors === 0) continue;
    const key = groupKey(draft, name);
    const list = byKey.get(key);
    if (list) list.push(draft);
    else byKey.set(key, [draft]);
  }

  const suggestions: PasteGroupSuggestion[] = [];
  for (const members of byKey.values()) {
    const first = members[0];
    if (!first || members.length < 2 || !first.baseName) continue;
    const combos = members.map((d) => `${d.sizes.value[0] ?? ''}|${d.colors.value[0]?.toLowerCase() ?? ''}`);
    if (new Set(combos).size !== combos.length) continue;
    const prices = members.map((d) => d.priceCents.value);
    const samePrice = prices[0] !== null && prices.every((p) => p === prices[0]);
    suggestions.push({
      // Cor implícita fica no nome ("Camiseta básica preta"); cor com marcador já saiu do nome.
      name: first.name.value ?? first.baseName,
      lines: members.map((d) => d.line),
      variants: members.map((d) => ({
        line: d.line,
        sizes: d.sizes.value,
        colors: d.colors.value,
        priceCents: d.priceCents.value,
      })),
      priceMode: samePrice ? 'single' : 'per_variant',
    });
  }
  return suggestions.sort((a, b) => (a.lines[0] ?? 0) - (b.lines[0] ?? 0));
}
