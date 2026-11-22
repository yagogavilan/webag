import { describe, expect, it } from 'vitest';
import { suggestGroups } from './group.js';
import { parsePastedText } from './parse-pasted-text.js';

// [HIPÓTESE] Listas escritas pelo time; validar com colagem real de lojista.
function groups(text: string) {
  return suggestGroups(parsePastedText(text).drafts);
}

describe('suggestGroups (WB-376 C10)', () => {
  it('"Camiseta básica P/M/G" vira 1 sugestão de 3 linhas, mesmo preço', () => {
    const result = groups('Camiseta básica P 49,90\nCamiseta básica M 49,90\nCamiseta básica G 49,90');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Camiseta básica', lines: [1, 2, 3], priceMode: 'single' });
    expect(result[0]?.variants.map((v) => v.sizes)).toEqual([['P'], ['M'], ['G']]);
  });

  it('preços diferentes viram preço por variação', () => {
    const result = groups('Camiseta básica P 49,90\nCamiseta básica M 49,90\nCamiseta básica GG 59,90');
    expect(result[0]?.priceMode).toBe('per_variant');
  });

  it('cores diferentes NÃO juntam (DEC-128: foto por cor está fora da v1.1; WB-376 C10)', () => {
    expect(groups('Camiseta básica preta P 49,90\nCamiseta básica branca P 49,90')).toEqual([]);
    expect(groups('Camiseta básica preta P 49,90\nCamiseta básica branca M 49,90')).toEqual([]);
  });

  it('mesma cor junta, com a cor no nome do produto', () => {
    const result = groups('Camiseta básica preta P 49,90\nCamiseta básica preta M 49,90');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Camiseta básica preta', lines: [1, 2] });
    expect(result[0]?.variants.map((v) => v.sizes)).toEqual([['P'], ['M']]);
  });

  it('com 3 linhas e uma cor diferente, só as da mesma cor entram no grupo', () => {
    const result = groups('Camiseta básica preta P 49,90\nCamiseta básica branca P 49,90\nCamiseta básica preta M 49,90');
    expect(result).toHaveLength(1);
    expect(result[0]?.lines).toEqual([1, 3]);
  });

  it('cor com marcador ("cor azul") junta pela cor e mantém o nome sem ela', () => {
    const result = groups('Camiseta cor azul P 49,90\nCamiseta cor azul M 49,90\nCamiseta cor verde G 49,90');
    expect(result).toHaveLength(1);
    expect(result[0]?.lines).toEqual([1, 2]);
    expect(result[0]?.name).toBe('Camiseta');
  });

  it('linha com cor e linha sem cor não juntam', () => {
    expect(groups('Camiseta preta P 49,90\nCamiseta M 49,90')).toEqual([]);
  });

  it('ignora acento e caixa no nome', () => {
    expect(groups('CAMISETA BASICA P 49,90\nCamiseta básica M 49,90')).toHaveLength(1);
  });

  it('não sugere para linha única, nomes diferentes ou linhas sem tamanho nem cor', () => {
    expect(groups('Camiseta P 49,90')).toEqual([]);
    expect(groups('Camiseta P 49,90\nBermuda P 79,90')).toEqual([]);
    expect(groups('Caneca 10,00\nCaneca 10,00')).toEqual([]);
  });

  it('não sugere quando a mesma combinação se repete (a grade recusa combinação repetida)', () => {
    expect(groups('Camiseta P 49,90\nCamiseta P 49,90\nCamiseta M 49,90')).toEqual([]);
  });

  it('linha com vários tamanhos não entra no grupo', () => {
    expect(groups('Camiseta tam P M G 49,90\nCamiseta GG 59,90')).toEqual([]);
  });

  it('separa dois grupos independentes na ordem do texto', () => {
    const result = groups('Bermuda P 79,90\nCamiseta P 49,90\nBermuda M 79,90\nCamiseta M 49,90');
    expect(result.map((g) => g.name)).toEqual(['Bermuda', 'Camiseta']);
    expect(result.map((g) => g.lines)).toEqual([[1, 3], [2, 4]]);
  });

  it('linha sem preço entra no grupo com preço nulo e modo por variação', () => {
    const result = groups('Camiseta P 49,90\nCamiseta M');
    expect(result[0]?.priceMode).toBe('per_variant');
    expect(result[0]?.variants[1]?.priceCents).toBeNull();
  });
});
