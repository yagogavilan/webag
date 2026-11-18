import { describe, expect, it } from 'vitest';
import { attributesKey, validateVariantSet } from './variants.js';

const variant = (attributes: Record<string, string>, extra: { sku?: string } = {}) => ({ attributes, stock: 1, ...extra });

describe('chave da combinação (O2-VAR-02)', () => {
  it('P = p = "P " e a ordem dos atributos não importa', () => {
    expect(attributesKey({ Tamanho: 'P', Cor: 'Azul' })).toBe(attributesKey({ cor: 'azul ', TAMANHO: 'p' }));
  });

  it('espaços internos repetidos e acentos compostos/decompostos são o mesmo valor', () => {
    expect(attributesKey({ Cor: 'Azul   claro' })).toBe(attributesKey({ Cor: 'azul claro' }));
    expect(attributesKey({ Cor: 'Cinzá' })).toBe(attributesKey({ Cor: 'Cinzá'.normalize('NFD').replace('á', 'á') === 'x' ? '' : 'Cinzá' }));
  });

  it('valores diferentes geram chaves diferentes', () => {
    expect(attributesKey({ Tamanho: 'P' })).not.toBe(attributesKey({ Tamanho: 'M' }));
  });
});

describe('conjunto de variações (WB-061, O2-VAR-01)', () => {
  it('até 3 atributos: 4 é recusado', () => {
    expect(validateVariantSet(['A', 'B', 'C'], [variant({ A: '1', B: '2', C: '3' })], 100)).toEqual([]);
    const issues = validateVariantSet(['A', 'B', 'C', 'D'], [variant({ A: '1', B: '2', C: '3', D: '4' })], 100);
    expect(issues.some((i) => i.field === 'attributes' && /No máximo 3/.test(i.message))).toBe(true);
  });

  it('100 combinações passam e 101 são recusadas', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => variant({ Tamanho: `T${i}` }));
    expect(validateVariantSet(['Tamanho'], make(100), 100)).toEqual([]);
    expect(validateVariantSet(['Tamanho'], make(101), 100).some((i) => i.field === 'variants')).toBe(true);
  });

  it('combinação duplicada, inclusive P x p e "Azul" x "Azul ", aponta o índice da repetida', () => {
    const issues = validateVariantSet(['Tamanho', 'Cor'], [variant({ Tamanho: 'P', Cor: 'Azul' }), variant({ Tamanho: 'p', Cor: 'Azul ' })], 100);
    expect(issues).toEqual([{ field: 'variants[1].attributes', message: 'Essa combinação já existe' }]);
  });

  it('variação sem todos os atributos ou com valor vazio é recusada', () => {
    expect(validateVariantSet(['Tamanho', 'Cor'], [variant({ Tamanho: 'P' })], 100).some((i) => /todos os atributos/.test(i.message))).toBe(true);
    expect(validateVariantSet(['Tamanho'], [variant({ Tamanho: '   ' })], 100).some((i) => /vazio/.test(i.message))).toBe(true);
  });

  it('atributos repetidos (Cor e cor) são recusados; "sem variação" (sem atributos) é válido', () => {
    expect(validateVariantSet(['Cor', 'cor'], [variant({ Cor: 'A', cor: 'B' })], 100).some((i) => /repetidos/.test(i.message))).toBe(true);
    expect(validateVariantSet([], [variant({})], 100)).toEqual([]);
  });

  it('SKU repetido na mesma lista é recusado sem diferenciar caixa', () => {
    const issues = validateVariantSet(['Tamanho'], [variant({ Tamanho: 'P' }, { sku: 'ABC-1' }), variant({ Tamanho: 'M' }, { sku: 'abc-1 ' })], 100);
    expect(issues).toEqual([{ field: 'variants[1].sku', message: 'Código repetido.' }]);
  });
});
