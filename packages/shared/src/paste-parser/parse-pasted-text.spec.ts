import { describe, expect, it } from 'vitest';
import { parsePastedText } from './parse-pasted-text.js';
import { PASTE_MAX_LINES, type PasteDraft, type PasteIssue, type PasteParseOptions } from './types.js';

// [HIPÓTESE] Todas as linhas abaixo foram escritas pelo time a partir do PRD (RN-Q8, WB-376) e do que se espera
// de listas de WhatsApp de lojas de roupa, casa e variedades da região. Nenhuma foi validada com lista real de
// lojista: o teste de usabilidade (colar a lista de verdade) é o que confirma.

function one(line: string, options?: PasteParseOptions): PasteDraft {
  const result = parsePastedText(line, options);
  const draft = result.drafts[0];
  if (!draft) throw new Error(`nenhum rascunho para: ${JSON.stringify(line)}`);
  return draft;
}

function codes(draft: PasteDraft): PasteIssue['code'][] {
  return draft.issues.map((issue) => issue.code);
}

interface Expected {
  name: string | null;
  sizes?: string[];
  price: number | null;
  qty: number | null;
  status: PasteDraft['status'];
}

function summary(draft: PasteDraft): Expected {
  return {
    name: draft.name.value,
    sizes: draft.sizes.value,
    price: draft.priceCents.value,
    qty: draft.quantity.value,
    status: draft.status,
  };
}

describe('critérios do PRD (WB-376)', () => {
  it('C1: "Bermuda jeans M 79,90 4 un" vira nome, tamanho M, R$ 79,90 e quantidade 4', () => {
    const draft = one('Bermuda jeans M 79,90 4 un');
    expect(summary(draft)).toEqual({ name: 'Bermuda jeans', sizes: ['M'], price: 7990, qty: 4, status: 'ready' });
    expect(draft.priceCents.confidence).toBe('high');
    expect(draft.quantity.assumed).toBe(false);
  });

  it('C2: linha sem preço fica incompleta com "missing_price"', () => {
    const draft = one('Toalha de banho cinza 4 un');
    expect(draft.status).toBe('incomplete');
    expect(codes(draft)).toContain('missing_price');
    expect(draft.priceCents).toMatchObject({ value: null, confidence: 'none' });
    expect(draft.quantity.value).toBe(4);
  });

  it('C3: 101 linhas devolvem as 100 primeiras e sinalizam o excesso', () => {
    const text = Array.from({ length: 101 }, (_, i) => `Produto ${i + 1} 10,00`).join('\n');
    const result = parsePastedText(text);
    expect(result.overLimit).toBe(true);
    expect(result.totalLines).toBe(101);
    expect(result.drafts).toHaveLength(PASTE_MAX_LINES);
    expect(result.drafts[99]?.name.value).toBe('Produto 100');
  });

  it('C3: exatamente 100 linhas não é excesso', () => {
    const text = Array.from({ length: 100 }, (_, i) => `Produto ${i + 1} 10,00`).join('\r\n');
    const result = parsePastedText(text);
    expect(result.overLimit).toBe(false);
    expect(result.drafts).toHaveLength(100);
  });

  it.each(['79.90', '79,90', 'R$ 79,90', 'R$79,90', 'r$ 79.90', '79,90 reais', 'preço: 79,90', 'Valor 79,90'])(
    'C5: o preço "%s" vira 7990 centavos',
    (price) => {
      expect(one(`Bermuda jeans ${price}`).priceCents.value).toBe(7990);
    },
  );

  it('C7: o parser só devolve dados e não usa rede', () => {
    // Função pura e síncrona: não há como chamar fetch. Garantimos que não depende dele.
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('rede proibida');
    }) as typeof fetch;
    try {
      expect(() => parsePastedText('Bermuda jeans M 79,90 4 un')).not.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });

  describe('C8: texto puro, literal e sem executar nada', () => {
    it('fórmula de planilha fica literal no nome (o escape é da exportação e do servidor)', () => {
      const draft = one('=HYPERLINK("http://x")');
      expect(draft.name.value).toBe('=HYPERLINK("http://x")');
      expect(draft.status).toBe('incomplete');
    });

    it('nome iniciado por =, +, - ou @ é preservado', () => {
      expect(one('=1+1 49,90').name.value).toBe('=1+1');
      expect(one('@promo 49,90').name.value).toBe('@promo');
      expect(one('+camiseta 49,90').name.value).toBe('+camiseta');
    });

    it('<script> aparece literal', () => {
      expect(one('<script>alert(1)</script> 10,00').name.value).toBe('<script>alert(1)</script>');
    });

    it('remove caracteres de controle, zero-width, bidi e BOM', () => {
      const draft = one('\uFEFFBer\u0000mu\u200Bda\u202E jeans\u0007 79,90');
      expect(draft.name.value).toBe('Bermuda jeans');
      expect(draft.source).toBe('Bermuda jeans 79,90');
    });

    it('palavras como __proto__ e constructor não quebram nada', () => {
      expect(one('__proto__ 10,00').name.value).toBe('__proto__');
      expect(one('constructor toString 10,00').name.value).toBe('constructor toString');
    });

    it('linha com mais de 200 caracteres é cortada e marcada', () => {
      const draft = one(`${'a'.repeat(250)} 10,00`);
      expect(draft.source).toHaveLength(200);
      expect(codes(draft)).toContain('line_truncated');
      expect(draft.status).not.toBe('ready');
    });
  });

  it('C10/C11 do WB-376: tênis em categoria de calçado lê o tamanho e marca "Confira"', () => {
    const draft = one('Tênis 42 199,90 2 un', { footwearCategory: true });
    expect(summary(draft)).toEqual({ name: 'Tênis', sizes: ['42'], price: 19990, qty: 2, status: 'confirm' });
    expect(draft.issues).toContainEqual({ code: 'check_field', severity: 'confirm', field: 'sizes', reason: 'numeric_size' });
  });

  it('C11: "Bermuda P 49,90 G 59,90" marca "Mais de um preço" e sugere separar', () => {
    const draft = one('Bermuda P 49,90 G 59,90');
    expect(draft.priceCents.value).toBeNull();
    expect(draft.status).toBe('confirm');
    expect(draft.issues).toContainEqual({
      code: 'multiple_prices',
      severity: 'confirm',
      candidatesCents: [4990, 5990],
      splitLines: ['Bermuda P 49,90', 'Bermuda G 59,90'],
    });
  });
});

describe('listas de exemplo por tipo de loja', () => {
  const cases: [string, string, Expected, PasteParseOptions?][] = [
    // roupa
    ['roupa', 'Camiseta básica preta P 49.90 x3', { name: 'Camiseta básica preta', sizes: ['P'], price: 4990, qty: 3, status: 'ready' }],
    ['roupa', 'Vestido floral midi R$ 129,90 - 4 peças', { name: 'Vestido floral midi', sizes: [], price: 12990, qty: 4, status: 'ready' }],
    ['roupa', 'Blusa cropped GG 35,00', { name: 'Blusa cropped', sizes: ['GG'], price: 3500, qty: 1, status: 'ready' }],
    ['roupa', 'Calça jeans feminina tam 38 R$ 99,90', { name: 'Calça jeans feminina', sizes: ['38'], price: 9990, qty: 1, status: 'confirm' }],
    ['roupa', 'Biquíni tamanho único 39,90 3 un', { name: 'Biquíni', sizes: ['Único'], price: 3990, qty: 3, status: 'ready' }],
    ['roupa', 'Moletom canguru XG 119,90 2 un', { name: 'Moletom canguru', sizes: ['XG'], price: 11990, qty: 2, status: 'ready' }],
    ['roupa', 'Conjunto infantil moletom 59,90 5 un', { name: 'Conjunto infantil moletom', sizes: [], price: 5990, qty: 5, status: 'ready' }],
    ['roupa', 'Meia kit 3 pares 19,90', { name: 'Meia kit 3 pares', sizes: [], price: 1990, qty: 1, status: 'ready' }],
    // calçado
    ['calçado', 'Chinelo Havaianas 39 29,90', { name: 'Chinelo Havaianas', sizes: ['39'], price: 2990, qty: 1, status: 'confirm' }],
    ['calçado', 'Sandália rasteira 37 49,90 4 pares', { name: 'Sandália rasteira', sizes: ['37'], price: 4990, qty: 4, status: 'confirm' }],
    ['calçado', 'Tênis esportivo 41 R$ 149,90', { name: 'Tênis esportivo', sizes: ['41'], price: 14990, qty: 1, status: 'confirm' }],
    ['calçado', 'Bermuda 42 79,90', { name: 'Bermuda 42', sizes: [], price: 7990, qty: 1, status: 'ready' }],
    // casa
    ['casa', 'Almofada xadrez 45 cm 35,00 6 un', { name: 'Almofada xadrez 45 cm', sizes: [], price: 3500, qty: 6, status: 'ready' }],
    ['casa', 'Jogo de panelas antiaderente 7 peças 189,90', { name: 'Jogo de panelas antiaderente 7 peças', sizes: [], price: 18990, qty: 1, status: 'ready' }],
    ['casa', 'Tapete sala 2,00 x 3,00 150,00', { name: 'Tapete sala 2,00 x 3,00', sizes: [], price: 15000, qty: 1, status: 'ready' }],
    ['casa', 'Tecido oxford 1,50 m 25,00', { name: 'Tecido oxford 1,50 m', sizes: [], price: 2500, qty: 1, status: 'ready' }],
    ['casa', 'Panela de pressão 5L 89,90 3 un', { name: 'Panela de pressão 5L', sizes: [], price: 8990, qty: 3, status: 'ready' }],
    ['casa', 'Cama box casal 1.299,90', { name: 'Cama box casal', sizes: [], price: 129990, qty: 1, status: 'ready' }],
    ['casa', 'Sofá retrátil 1.299', { name: 'Sofá retrátil', sizes: [], price: 129900, qty: 1, status: 'confirm' }],
    ['casa', 'Toalha de banho cinza 4 un', { name: 'Toalha de banho cinza', sizes: [], price: null, qty: 4, status: 'incomplete' }],
    // variedades
    ['variedades', 'Lâmpada LED 9W 110V 12,50 10un', { name: 'Lâmpada LED 9W 110V', sizes: [], price: 1250, qty: 10, status: 'ready' }],
    ['variedades', 'Caneca porcelana 15,00 estoque 12', { name: 'Caneca porcelana', sizes: [], price: 1500, qty: 12, status: 'ready' }],
    ['variedades', 'Copo americano R$ 4,50 x 24', { name: 'Copo americano', sizes: [], price: 450, qty: 24, status: 'ready' }],
    ['variedades', 'Caderno 10 matérias 18,90 qtd: 8', { name: 'Caderno 10 matérias', sizes: [], price: 1890, qty: 8, status: 'ready' }],
    ['variedades', 'Carregador turbo 25,00 4 em estoque', { name: 'Carregador turbo', sizes: [], price: 2500, qty: 4, status: 'ready' }],
    ['variedades', 'Brinquedo carrinho 12,5', { name: 'Brinquedo carrinho', sizes: [], price: 1250, qty: 1, status: 'ready' }],
  ];

  it.each(cases)('%s: "%s"', (_tipo, line, expected, options) => {
    expect(summary(one(line, options))).toEqual(expected);
  });
});

describe('preço', () => {
  it.each([
    ['Camiseta 49', 4900, 'low', 'confirm'],
    ['Camiseta R$ 49', 4900, 'high', 'ready'],
    ['Camiseta 79,9', 7990, 'medium', 'ready'],
    ['Camiseta 1.299', 129900, 'medium', 'confirm'],
    ['Camiseta 1.299,90', 129990, 'high', 'ready'],
    ['Camiseta 1299,90', 129990, 'high', 'ready'],
    ['Camiseta 99999,99', 9_999_999, 'high', 'ready'],
    ['Camiseta 0,50', 50, 'high', 'ready'],
    ['Camiseta (79,90)', 7990, 'high', 'ready'],
    ['Camiseta 79,90.', 7990, 'high', 'ready'],
    ['Camiseta 79,90,', 7990, 'high', 'ready'],
  ] as const)('"%s" -> %i centavos', (line, cents, confidence, status) => {
    const draft = one(line);
    expect(draft.priceCents.value).toBe(cents);
    expect(draft.priceCents.confidence).toBe(confidence);
    expect(draft.status).toBe(status);
  });

  it('nunca usa ponto flutuante: 19,99 e 0,29 viram centavos exatos', () => {
    expect(one('A 19,99').priceCents.value).toBe(1999);
    expect(one('A 0,29').priceCents.value).toBe(29);
    expect(one('A 1.005,10').priceCents.value).toBe(100510);
  });

  it.each(['Brinde 0,00', 'Camiseta R$ 0', 'Camiseta 100000,00', 'Camiseta R$ 100000'])(
    '"%s" é preço inválido (zero ou acima de R$ 99.999,99)',
    (line) => {
      const draft = one(line);
      expect(draft.priceCents.value).toBeNull();
      expect(codes(draft)).toContain('invalid_price');
      expect(draft.status).toBe('incomplete');
    },
  );

  it('dois preços iguais são um só', () => {
    expect(one('Camiseta 79,90 R$ 79,90').priceCents.value).toBe(7990);
  });

  it('dois inteiros soltos sem preço claro não são adivinhados', () => {
    const draft = one('Camiseta 49 3');
    expect(draft.priceCents.value).toBeNull();
    expect(draft.status).toBe('incomplete');
    expect(draft.name.value).toBe('Camiseta 49 3');
  });

  it('inteiro solto depois do preço é quantidade de baixa confiança', () => {
    const draft = one('Bermuda M 79,90 4');
    expect(draft.quantity).toEqual({ value: 4, confidence: 'low', assumed: false });
    expect(draft.status).toBe('confirm');
    expect(draft.issues).toContainEqual({ code: 'check_field', severity: 'confirm', field: 'quantity', reason: 'bare_quantity' });
  });

  it('o preço único com "preço" na frente não vira nome', () => {
    expect(one('Bolsa preço 59,90').name.value).toBe('Bolsa');
  });
});

describe('quantidade', () => {
  it.each([
    ['Caneca 10,00 4 un', 4],
    ['Caneca 10,00 4un', 4],
    ['Caneca 10,00 4 und', 4],
    ['Caneca 10,00 4 unid', 4],
    ['Caneca 10,00 4 unidades', 4],
    ['Caneca 10,00 x4', 4],
    ['Caneca 10,00 X4', 4],
    ['Caneca 10,00 x 4', 4],
    ['Caneca 10,00 4 peças', 4],
    ['Caneca 10,00 4 pcs', 4],
    ['Caneca 10,00 4 pçs', 4],
    ['Caneca 10,00 4 pares', 4],
    ['Caneca 10,00 qtd 4', 4],
    ['Caneca 10,00 qtd: 4', 4],
    ['Caneca 10,00 Qtde:4', 4],
    ['Caneca 10,00 estoque 4', 4],
    ['Caneca 10,00 estoque: 0', 0],
    ['Caneca 4 un 10,00', 4],
    ['4 un Caneca 10,00', 4],
  ])('"%s" -> %i', (line, qty) => {
    const draft = one(line);
    expect(draft.quantity.value).toBe(qty);
    expect(draft.priceCents.value).toBe(1000);
    expect(draft.name.value).toBe('Caneca');
  });

  it('sem quantidade vira 1, marcado como assumido', () => {
    expect(one('Caneca 10,00').quantity).toEqual({ value: 1, confidence: 'none', assumed: true });
  });

  it('quantidade acima de 99.999 é inválida', () => {
    const draft = one('Caneca 10,00 estoque 100000');
    expect(draft.quantity.value).toBeNull();
    expect(codes(draft)).toContain('invalid_quantity');
    expect(draft.status).toBe('incomplete');
  });

  it('99.999 é aceita', () => {
    expect(one('Caneca 10,00 99999 un').quantity.value).toBe(99_999);
  });

  it('duas quantidades na mesma linha não são adivinhadas', () => {
    const draft = one('Camiseta 49,90 P 2un M 3un');
    expect(draft.quantity.value).toBeNull();
    expect(draft.status).toBe('confirm');
    expect(draft.issues).toContainEqual({ code: 'multiple_quantities', severity: 'confirm', candidates: [2, 3] });
  });
});

describe('tamanho e cor', () => {
  it.each([
    ['Camiseta PP 39,90', ['PP']],
    ['Camiseta p 39,90', ['P']],
    ['Camiseta (G) 39,90', ['G']],
    ['Camiseta GG 39,90', ['GG']],
    ['Camiseta XGG 39,90', ['XGG']],
    ['Camiseta G1 39,90', ['G1']],
    ['Camiseta tam M 39,90', ['M']],
    ['Camiseta tam: M 39,90', ['M']],
    ['Camiseta tamanho G 39,90', ['G']],
    ['Camiseta tam P M G 39,90', ['P', 'M', 'G']],
    ['Camiseta tam P e M 39,90', ['P', 'M']],
    ['Camiseta P/M/G 39,90', ['P', 'M', 'G']],
    ['Camiseta P-M-G-GG 39,90', ['P', 'M', 'G', 'GG']],
    ['Camiseta P, M, G 39,90', ['P', 'M', 'G']],
    ['Camiseta PMG 39,90', ['P', 'M', 'G']],
  ])('"%s" -> %j', (line, sizes) => {
    const draft = one(line);
    expect(draft.sizes.value).toEqual(sizes);
    expect(draft.name.value).toBe('Camiseta');
    expect(draft.priceCents.value).toBe(3990);
  });

  it('vários tamanhos pedem confirmação (grade ou separar)', () => {
    const draft = one('Camiseta tam P M G 39,90');
    expect(draft.status).toBe('confirm');
    expect(draft.issues).toContainEqual({ code: 'multiple_sizes', severity: 'confirm', sizes: ['P', 'M', 'G'] });
  });

  it('tamanho em minúscula sem marcador tem confiança média e pede conferência', () => {
    const draft = one('Camiseta m 39,90');
    expect(draft.sizes).toEqual({ value: ['M'], confidence: 'medium', assumed: false });
    expect(draft.issues).toContainEqual({ code: 'check_field', severity: 'confirm', field: 'sizes', reason: 'lowercase_size' });
  });

  it('"m" minúsculo depois de número é metro, não tamanho M', () => {
    const draft = one('Fita 2 m 10,00');
    expect(draft.sizes.value).toEqual([]);
    expect(draft.name.value).toBe('Fita 2 m');
  });

  it('"M" maiúsculo depois de preço é tamanho', () => {
    const draft = one('Camiseta 49,90 M');
    expect(draft.sizes.value).toEqual(['M']);
    expect(draft.priceCents.value).toBe(4990);
  });

  it('tamanho numérico sem calçado e sem marcador não é lido', () => {
    const draft = one('Camiseta 42 49,90');
    expect(draft.sizes.value).toEqual([]);
    expect(draft.name.value).toBe('Camiseta 42');
  });

  it('número só de calçado (33 a 48): fora da faixa continua no nome', () => {
    const draft = one('Tênis 50 199,90', { footwearCategory: true });
    expect(draft.sizes.value).toEqual([]);
    expect(draft.name.value).toBe('Tênis 50');
  });

  it('em calçado, um único inteiro entre 33 e 48 vira tamanho (falta o preço), não preço', () => {
    const draft = one('Tênis Nike 42');
    expect(draft.sizes.value).toEqual(['42']);
    expect(draft.status).toBe('incomplete');
  });

  it('em calçado, dois inteiros: o da faixa 33-48 é tamanho e o outro é preço de baixa confiança', () => {
    const draft = one('Tênis 42 199');
    expect(summary(draft)).toEqual({ name: 'Tênis', sizes: ['42'], price: 19900, qty: 1, status: 'confirm' });
  });

  it('cor explícita sai do nome; cor implícita fica no nome e vira sugestão', () => {
    const explicit = one('Camiseta cor azul marinho P 39,90');
    expect(explicit.name.value).toBe('Camiseta');
    expect(explicit.colors).toEqual({ value: ['azul marinho'], confidence: 'high', assumed: false });

    const implicit = one('Camiseta básica preta P 39,90');
    expect(implicit.name.value).toBe('Camiseta básica preta');
    expect(implicit.baseName).toBe('Camiseta básica');
    expect(implicit.colors).toEqual({ value: ['preta'], confidence: 'low', assumed: false });
    expect(implicit.status).toBe('ready');
  });

  it('várias cores', () => {
    expect(one('Camiseta cores: preto e branco 39,90').colors.value).toEqual(['preto', 'branco']);
    expect(one('Camiseta preto/branco/azul 39,90').colors.value).toEqual(['preto', 'branco', 'azul']);
  });

  it('sem cor, sem tamanho: campos vazios', () => {
    const draft = one('Caneca 10,00');
    expect(draft.colors).toEqual({ value: [], confidence: 'none', assumed: false });
    expect(draft.sizes).toEqual({ value: [], confidence: 'none', assumed: false });
  });
});

describe('formatos de WhatsApp e tolerância', () => {
  it.each([
    ['1. Bermuda jeans M 79,90'],
    ['2) Bermuda jeans M 79,90'],
    ['- Bermuda jeans M 79,90'],
    ['• Bermuda jeans M 79,90'],
    ['* Bermuda jeans M 79,90'],
    ['*Bermuda jeans* M 79,90'],
    ['_Bermuda jeans_ ~M~ 79,90'],
    ['✅ Bermuda jeans M 79,90 💰'],
    ['🔥🔥 Bermuda jeans 👖 M 79,90'],
    ['👉Bermuda jeans M R$79,90👈'],
    ['   Bermuda    jeans\tM \t 79,90   '],
    ['Bermuda\u00A0jeans\u00A0M\u00A079,90'],
    ['Bermuda jeans, M, 79,90'],
    ['Bermuda jeans - M - 79,90'],
    ['Bermuda jeans | M | 79,90'],
    ['[10:32, 22/11/2025] Maria: Bermuda jeans M 79,90'],
    ['22/11/2025 10:32 - Maria: Bermuda jeans M 79,90'],
  ])('lê "%s" como Bermuda jeans, M, 79,90', (line) => {
    expect(summary(one(line))).toEqual({ name: 'Bermuda jeans', sizes: ['M'], price: 7990, qty: 1, status: 'ready' });
  });

  it('aceita quebras de linha do Windows, do Mac antigo e do Unix, e ignora linhas vazias', () => {
    const text = 'Camiseta P 49,90\r\n\r\nBermuda M 79,90\rVestido 129,90\n   \n\t\nSaia 59,90\r\n';
    const result = parsePastedText(text);
    expect(result.drafts.map((d) => d.name.value)).toEqual(['Camiseta', 'Bermuda', 'Vestido', 'Saia']);
    expect(result.drafts.map((d) => d.line)).toEqual([1, 3, 4, 7]);
    expect(result.totalLines).toBe(4);
  });

  it('linha só com emoji ou símbolos é ignorada (não vira rascunho)', () => {
    const result = parsePastedText('✅✅✅\nCaneca 10,00\n-----\n🔥');
    expect(result.drafts).toHaveLength(1);
    expect(result.totalLines).toBe(1);
  });

  it('emoji com modificadores e sequências ZWJ não deixam lixo no nome', () => {
    expect(one('👩🏽\u200D🦰 Blusa 👍🏻 29,90').name.value).toBe('Blusa');
    expect(one('Kit 1️⃣ Blusa 29,90').priceCents.value).toBe(2990);
  });

  it('texto vazio, só espaços ou valor que não é string não quebram', () => {
    for (const input of ['', '   \n\r\n  ', undefined as unknown as string, null as unknown as string, 42 as unknown as string]) {
      expect(parsePastedText(input)).toEqual({ drafts: [], totalLines: 0, overLimit: false });
    }
  });

  it('linha só com nome: incompleta; linha só com preço: sem nome', () => {
    expect(one('Caneca esmaltada').status).toBe('incomplete');
    const noName = one('R$ 79,90');
    expect(noName.name.value).toBeNull();
    expect(codes(noName)).toContain('missing_name');
    expect(noName.status).toBe('incomplete');
  });

  it('nome com mais de 80 caracteres é cortado e marcado', () => {
    const draft = one(`${'Camiseta '.repeat(12).trim()} 10,00`);
    expect(draft.name.value).toHaveLength(80);
    expect(codes(draft)).toContain('name_truncated');
    expect(draft.status).toBe('confirm');
  });

  it('ordem livre: preço e quantidade antes do nome', () => {
    expect(summary(one('R$ 79,90 4 un Bermuda jeans M'))).toEqual({
      name: 'Bermuda jeans',
      sizes: ['M'],
      price: 7990,
      qty: 4,
      status: 'ready',
    });
  });
});

describe('entrada patológica (sem ReDoS)', () => {
  const KB100 = 100 * 1024;
  const patterns: [string, string][] = [
    ['só dígitos', '9'.repeat(KB100)],
    ['vírgulas e dígitos', '1,'.repeat(KB100 / 2)],
    ['pontos de milhar', '1.000'.repeat(KB100 / 5)],
    ['palavras curtas', 'a '.repeat(KB100 / 2)],
    ['R$ repetido', 'R$ '.repeat(KB100 / 3)],
    ['tamanhos com barra', 'P/'.repeat(KB100 / 2)],
    ['x e números', 'x1 '.repeat(KB100 / 3)],
    ['sem espaços', 'x'.repeat(KB100)],
    ['espaços', ' '.repeat(KB100)],
    ['quebras de linha', '\n'.repeat(KB100)],
    ['quebras do Windows', '\r\n'.repeat(KB100 / 2)],
    ['emoji', '🔥'.repeat(KB100 / 4)],
    ['colchetes de data do WhatsApp', '[10:32, 22/11/2025] '.repeat(KB100 / 20)],
    ['prefixo de data sem fim', `[10:32, 22/11/2025${' '.repeat(KB100)}`],
    ['dois pontos', ':'.repeat(KB100)],
    ['cor e tamanho', 'cor tam '.repeat(KB100 / 8)],
    ['uma linha comprida válida', `Bermuda ${'jeans '.repeat(KB100 / 6)} 79,90`],
    ['100 linhas de 1 KB', Array.from({ length: 100 }, () => `${'z'.repeat(1000)} 10,00`).join('\n')],
    ['muitas linhas curtas', Array.from({ length: KB100 / 8 }, () => 'a 1,00\n').join('')],
  ];

  it.each(patterns)('%s (100 KB) termina rápido e respeita os limites', (_nome, text) => {
    const started = performance.now();
    const result = parsePastedText(text);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
    expect(result.drafts.length).toBeLessThanOrEqual(PASTE_MAX_LINES);
    for (const draft of result.drafts) {
      expect(draft.source.length).toBeLessThanOrEqual(200);
      expect(draft.name.value === null || draft.name.value.length <= 80).toBe(true);
    }
  });
});
