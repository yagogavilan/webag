import { IMPORT_HEADERS, IMPORT_TEMPLATE, parseCsv, parseLocalDateTime, parseMoneyCents, planImport } from './import.js';

const categories = new Map([['roupas', 'cat-roupas'], ['calcados', 'cat-calcados']]);
const header = IMPORT_HEADERS.join(';');
const csv = (...lines: string[]) => [header, ...lines].join('\r\n');

describe('parseMoneyCents (O2-PRD-03)', () => {
  it.each([
    ['19,90', 1990],
    ['1.234,56', 123456],
    ['5', 500],
    ['R$ 19,90', 1990],
    ['19.90', 1990],
    ['1.234', 123400],
    ['0,01', 1],
  ])('converte %s em %i centavos', (raw, cents) => {
    expect(parseMoneyCents(raw)).toBe(cents);
  });

  it.each(['19,999', 'abc', '', '1,2,3', '-5'])('recusa %s', (raw) => {
    expect(parseMoneyCents(raw)).toBeNull();
  });
});

describe('parseLocalDateTime (America/Sao_Paulo)', () => {
  it('interpreta data e hora locais (UTC-3) e aplica o horário padrão', () => {
    expect(parseLocalDateTime('01/12/2026 08:30', '00:00')?.toISOString()).toBe('2026-12-01T11:30:00.000Z');
    expect(parseLocalDateTime('31/12/2026', '23:59')?.toISOString()).toBe('2027-01-01T02:59:00.000Z');
    expect(parseLocalDateTime('2026-12-01 00:00', '00:00')?.toISOString()).toBe('2026-12-01T03:00:00.000Z');
  });

  it('recusa data inexistente e lixo', () => {
    expect(parseLocalDateTime('31/02/2026', '00:00')).toBeNull();
    expect(parseLocalDateTime('amanhã', '00:00')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('aceita ponto e vírgula ou vírgula, BOM, aspas e quebra de linha dentro de campo', () => {
    expect(parseCsv('﻿a;b\r\n"x;y";"linha1\nlinha2"\r\n')).toEqual([['a', 'b'], ['x;y', 'linha1\nlinha2']]);
    expect(parseCsv('a,b\n"diz ""oi""",2')).toEqual([['a', 'b'], ['diz "oi"', '2']]);
  });
});

describe('planImport (WB-065)', () => {
  it('o modelo de planilha entregue ao lojista é válido', () => {
    const plan = planImport(IMPORT_TEMPLATE.replace('Roupas', 'Roupas'), categories, 100);
    expect('fileError' in plan).toBe(false);
    if ('products' in plan) {
      expect(plan.errors).toEqual([]);
      expect(plan.products).toHaveLength(1);
      expect(plan.products[0]?.variants).toHaveLength(2);
    }
  });

  it('agrupa linhas do mesmo produto, valida linha a linha e informa linha e motivo', () => {
    const plan = planImport(
      csv(
        'Tênis;Calçados;;100,00;;;;Tamanho: 40;;5;TEN-40',
        'Tênis;Calçados;;100,00;;;;Tamanho: 41;;3;TEN-41',
        'Tênis;Calçados;;100,00;;;;tamanho: 41;;1;TEN-41B', // combinação repetida (caixa)
        'Bota;Armas;;50,00;;;;;;1;', // categoria inexistente
        'Camisa;Roupas;;0,00;;;;;;1;', // preço zero
        'Meia;Roupas;;10,00;8,00;;;;;1;', // promoção incompleta
        'Blusa;Roupas;;10,00;;;;;;-1;', // estoque negativo
        'Saia;Roupas;;10,00;;;;Cor Azul;;1;', // variação sem ":"
        'Calça;Roupas;;10,00;;;;;;2;TEN-40', // SKU repetido no arquivo
      ),
      categories,
      100,
    );
    if ('fileError' in plan) throw new Error(plan.fileError);
    expect(plan.products.map((p) => p.name)).toEqual(['Tênis']);
    expect(plan.products[0]?.variants).toHaveLength(2);
    expect(plan.errors.map((e) => e.line)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(plan.errors[0]?.message).toBe('Essa combinação já existe');
    expect(plan.errors.at(-1)?.message).toMatch(/repetido/);
  });

  it('promoção válida vira data e hora locais, com o fim no último milissegundo do minuto (R-13)', () => {
    const plan = planImport(csv('Jaqueta;Roupas;;100,00;80,00;01/12/2026 00:00;31/12/2026 23:59;;;4;'), categories, 100);
    if ('fileError' in plan) throw new Error(plan.fileError);
    expect(plan.products[0]?.promoStartsAt?.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(plan.products[0]?.promoEndsAt?.toISOString()).toBe('2027-01-01T02:59:59.999Z');
    expect(planImport(csv('Jaqueta;Roupas;;100,00;120,00;01/12/2026;31/12/2026;;;4;'), categories, 100)).toMatchObject({ errors: [{ line: 2 }] });
  });

  it('erros de arquivo: cabeçalho errado, vazio e acima de 500 linhas (nada é criado)', () => {
    expect(planImport('nome;preco\r\nA;1', categories, 100)).toHaveProperty('fileError');
    expect(planImport(header, categories, 100)).toHaveProperty('fileError');
    const many = csv(...Array.from({ length: 501 }, (_, i) => `P${i};Roupas;;10,00;;;;;;1;`));
    expect(planImport(many, categories, 100)).toHaveProperty('fileError', 'A planilha passa de 500 linhas.');
    const ok500 = csv(...Array.from({ length: 500 }, (_, i) => `P${i};Roupas;;10,00;;;;;;1;`));
    expect(planImport(ok500, categories, 100)).toMatchObject({ totalLines: 500, errors: [] });
  });

  it('limite de combinações por produto', () => {
    const lines = Array.from({ length: 3 }, (_, i) => `Camisa;Roupas;;10,00;;;;Tamanho: T${i};;1;`);
    const plan = planImport(csv(...lines), categories, 2);
    if ('fileError' in plan) throw new Error(plan.fileError);
    expect(plan.errors[0]).toMatchObject({ line: 4 });
  });
});
