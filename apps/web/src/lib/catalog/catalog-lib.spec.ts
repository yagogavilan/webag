import { describe, expect, it } from 'vitest';
import { parseCents } from '@/lib/money';
import { validateProduct, parseStock, EMPTY_VALUES, promoPreview } from './form';
import { adjustPrice, discountPercent, pickImage } from './helpers';
import { combinations, fromServer, newAttr, rowKey, syncRows, toRequest, validateGrid, variantsSummary, type AttrDef } from './variants';

const size: AttrDef = { ...newAttr('size'), values: ['P', 'M'] };
const color: AttrDef = { ...newAttr('color'), values: ['Preto', 'Azul'] };

const plain = (text: string | null | undefined): string | null | undefined => text?.replace(/\u00a0/g, ' ');

describe('variações', () => {
  it('gera o produto cartesiano na ordem dos atributos', () => {
    expect(combinations([size, color])).toEqual([
      { Tamanho: 'P', Cor: 'Preto' },
      { Tamanho: 'P', Cor: 'Azul' },
      { Tamanho: 'M', Cor: 'Preto' },
      { Tamanho: 'M', Cor: 'Azul' },
    ]);
    expect(combinations([size, { ...color, values: [] }])).toEqual([{ Tamanho: 'P' }, { Tamanho: 'M' }]);
    expect(combinations([])).toEqual([]);
  });

  it('a chave ignora caixa, espaços e a ordem dos atributos (igual à API)', () => {
    expect(rowKey({ Tamanho: 'P ', Cor: 'azul' })).toBe(rowKey({ cor: 'Azul', tamanho: 'p' }));
  });

  it('regerar mantém estoque já digitado, respeita removidas e usa o padrão nas novas', () => {
    const first = syncRows([size, color], [], 10, new Set());
    first[0] = { ...first[0]!, stock: 3 };
    const removed = new Set([first[3]!.key]);
    const next = syncRows([{ ...size, values: ['P', 'M', 'G'] }, color], first, 7, removed);
    expect(next).toHaveLength(5);
    expect(next[0]!.stock).toBe(3);
    expect(next.find((row) => row.attributes.Tamanho === 'G')!.stock).toBe(7);
    expect(next.some((row) => row.key === first[3]!.key)).toBe(false);
  });

  it('resumo e validação', () => {
    const rows = syncRows([size, color], [], 10, new Set());
    expect(variantsSummary(rows)).toBe('4 opções · 40 em estoque');
    expect(variantsSummary(rows.slice(0, 1))).toBe('1 opção · 10 em estoque');
    const bad = [{ ...rows[0]!, stock: 1, reserved: 3 }, { ...rows[1]!, priceText: '0,00' }, { ...rows[2]!, sku: 'A' }, { ...rows[3]!, sku: 'a' }];
    const result = validateGrid([size, color], bad, parseCents);
    expect(result.rows.map((issue) => issue.message)).toEqual([
      '3 unidades estão reservadas em pedidos. O mínimo é 3.',
      'O preço precisa estar entre R$ 0,01 e R$ 99.999,99.',
      'Esse código já está em outra opção.',
    ]);
    const many = Array.from({ length: 120 }, (_, i) => ({ ...rows[0]!, key: `k${i}` }));
    expect(validateGrid([size], many, parseCents).general).toContain('Máximo de 100 opções. Você tem 120.');
  });

  it('lê do servidor e monta o corpo do PUT', () => {
    const { attrs, rows } = fromServer(['Tamanho'], [
      { id: 'v1', attributes: { Tamanho: 'P' }, sku: 'X', priceCents: 1990, stock: 4, reserved: 1 } as never,
      { id: 'v2', attributes: { Tamanho: 'M' }, sku: null, priceCents: null, stock: 0, reserved: 0 } as never,
    ]);
    expect(attrs[0]).toMatchObject({ kind: 'size', values: ['P', 'M'] });
    expect(toRequest(attrs, rows, parseCents)).toEqual({
      attributes: ['Tamanho'],
      variants: [
        { id: 'v1', attributes: { Tamanho: 'P' }, stock: 4, priceCents: 1990, sku: 'X' },
        { id: 'v2', attributes: { Tamanho: 'M' }, stock: 0, priceCents: null, sku: null },
      ],
    });
  });
});

describe('formulário do produto', () => {
  const ok = { ...EMPTY_VALUES, name: 'Camisa', categoryId: 'c', priceCents: 5990 };
  it('rascunho exige só o nome', () => {
    expect(validateProduct(EMPTY_VALUES, { readyPhotos: 0, variantRows: 0 }, 'draft')).toEqual({ name: 'Escreva o nome do produto.' });
    expect(validateProduct({ ...EMPTY_VALUES, name: 'Camisa' }, { readyPhotos: 0, variantRows: 0 }, 'draft')).toEqual({});
  });
  it('publicar confere tudo, com as mensagens da spec', () => {
    expect(Object.values(validateProduct(EMPTY_VALUES, { readyPhotos: 0, variantRows: 0 }, 'publish'))).toEqual(['Escreva o nome do produto.', 'Escolha a categoria.', 'Adicione ao menos 1 foto.', 'Informe o preço.']);
    expect(validateProduct({ ...ok, priceCents: 10_000_000 }, { readyPhotos: 1, variantRows: 0 }, 'publish').price).toBe('O preço máximo é R$ 99.999,99.');
    expect(validateProduct({ ...ok, mode: 'variants', stockText: '' }, { readyPhotos: 1, variantRows: 0 }, 'publish').variants).toBe('Defina as opções do produto.');
    expect(validateProduct({ ...ok, stockText: '1,5' }, { readyPhotos: 1, variantRows: 0 }, 'publish').stock).toBe('Use só números inteiros, de 0 a 99.999.');
    expect(validateProduct(ok, { readyPhotos: 1, variantRows: 0 }, 'publish')).toEqual({});
  });
  it('promoção', () => {
    const promo = { ...ok, promoOn: true, promoPriceCents: 7000, promoStart: '2026-12-01T08:00', promoEnd: '2026-12-02T08:00' };
    expect(plain(validateProduct(promo, { readyPhotos: 1, variantRows: 0 }, 'publish').promoPrice)).toBe('O preço da promoção precisa ser menor que R$ 59,90.');
    expect(validateProduct({ ...promo, promoPriceCents: 4000, promoEnd: '2026-12-01T08:00' }, { readyPhotos: 1, variantRows: 0 }, 'publish').promoEnd).toBe('A promoção precisa terminar depois do início.');
    expect(validateProduct({ ...promo, promoPriceCents: 4000 }, { readyPhotos: 1, variantRows: 0 }, 'publish')).toEqual({});
  });
  it('estoque e prévia', () => {
    expect(parseStock('0')).toBe(0);
    expect(parseStock('100000')).toBeNull();
    expect(parseStock('-1')).toBeNull();
    expect(plain(promoPreview(9990, 7990, discountPercent))).toBe('De R$ 99,90 por R$ 79,90 · 20% off');
    expect(promoPreview(9990, 12000, discountPercent)).toBeNull();
  });
});

describe('helpers do catálogo', () => {
  it('desconto arredonda para baixo e some abaixo de 1%', () => {
    expect(discountPercent(9990, 7990)).toBe(20);
    expect(discountPercent(10_000, 9_950)).toBeNull();
  });
  it('ajuste de preço em massa', () => {
    expect(adjustPrice(5990, 'percent', 10)).toBe(6589);
    expect(adjustPrice(5990, 'amount', -100)).toBe(5890);
  });
  it('escolhe a menor miniatura suficiente', () => {
    expect(pickImage({ '160': 'a', '400': 'b', '800': 'c' }, 300)).toBe('b');
    expect(pickImage({ '160': 'a' }, 800)).toBe('a');
    expect(pickImage(null, 160)).toBeNull();
  });
});

import { decodeCsv, errorsCsv, validateCsvFile } from './csv';

describe('planilha', () => {
  it('confere tipo e tamanho com as mensagens da tela', () => {
    expect(validateCsvFile({ name: 'a.xlsx', size: 10, type: 'application/vnd.ms-excel' })).toBe('Use o modelo do Webag, em CSV.');
    expect(validateCsvFile({ name: 'a.csv', size: 8 * 1024 * 1024 })).toBe('Esse arquivo tem 8 MB. O máximo é 1 MB.');
    expect(validateCsvFile({ name: 'a.csv', size: 1000 })).toBeNull();
  });
  it('lê Windows-1252 quando o arquivo não é UTF-8', () => {
    const ansi = new Uint8Array([0x43, 0x61, 0x66, 0xe9]); // "Café" em Windows-1252
    expect(decodeCsv(ansi.buffer)).toBe('Café');
    expect(decodeCsv(new TextEncoder().encode('Café').buffer as ArrayBuffer)).toBe('Café');
  });
  it('CSV de erros protege contra fórmula e escapa aspas', () => {
    const text = errorsCsv([{ line: 7, message: '=1+1 "x"' }]);
    expect(text).toContain('"7";"\'=1+1 ""x"""');
  });
});
