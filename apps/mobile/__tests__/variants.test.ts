import type { BrowseVariant } from '@webag/shared';
import { buildGroups, findVariant, selectOption, shownPrice, variantLabel } from '../src/features/catalog/variants';

const v = (id: string, attributes: Record<string, string>, available = true, price = 8990): BrowseVariant => ({
  id, attributes, price: { amount: price, currency: 'BRL' }, originalPrice: null, discountPercent: null, available, maxQuantity: available ? 3 : 0, lastUnits: null,
});
const variants = [v('1', { Tamanho: '40', Cor: 'Preto' }), v('2', { Tamanho: '40', Cor: 'Azul' }, false), v('3', { Tamanho: '42', Cor: 'Azul' }), v('4', { Tamanho: '42', Cor: 'Preto' }, false)];
const attrs = ['Tamanho', 'Cor'];

describe('variações com estoque', () => {
  it('sem escolha, uma opção está disponível se existe alguma combinação com estoque', () => {
    const groups = buildGroups(attrs, variants, {});
    expect(groups[0]?.options).toEqual([{ value: '40', available: true }, { value: '42', available: true }]);
    expect(groups[1]?.options).toEqual([{ value: 'Preto', available: true }, { value: 'Azul', available: true }]);
  });

  it('escolher o tamanho recalcula as cores: só combinações com estoque ficam selecionáveis', () => {
    const groups = buildGroups(attrs, variants, { Tamanho: '40' });
    expect(groups[1]?.options).toEqual([{ value: 'Preto', available: true }, { value: 'Azul', available: false }]);
  });

  it('trocar o tamanho derruba a cor que ficou sem estoque', () => {
    const next = selectOption(attrs, variants, { Tamanho: '42', Cor: 'Azul' }, 'Tamanho', '40');
    expect(next).toEqual({ Tamanho: '40' });
  });

  it('acha a variação só com todos os atributos marcados', () => {
    expect(findVariant(attrs, variants, { Tamanho: '42' })).toBeUndefined();
    expect(findVariant(attrs, variants, { Tamanho: '42', Cor: 'Azul' })?.id).toBe('3');
    expect(variantLabel(attrs, { Tamanho: '42', Cor: 'Azul' })).toBe('42 · Azul');
  });

  it('preço: "a partir de" quando as variações têm preços diferentes e nada foi escolhido', () => {
    const mixed = [v('a', { Tamanho: 'P' }, true, 5000), v('b', { Tamanho: 'G' }, true, 7000)];
    expect(shownPrice({}, mixed, undefined)).toMatchObject({ cents: 5000, from: true });
    expect(shownPrice({}, mixed, mixed[1])).toMatchObject({ cents: 7000, from: false });
    expect(shownPrice({ price: { amount: 100 } }, [], undefined)).toMatchObject({ cents: 100, from: false });
  });
});
