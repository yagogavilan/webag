import { describe, expect, it } from 'vitest';
import { MAX_STOCK, applyAdjust, available, isLow, isOfferable, isProductVisible, lowStockTransition } from './stock.js';

describe('ajuste de estoque (RN-06, O2-VAR-04, O2-EST-03)', () => {
  it('disponível = estoque - reservado', () => {
    expect(available(10, 3)).toBe(7);
  });

  it('reservado 3: ajustar para 2 falha, para 3 passa (fronteira exata)', () => {
    expect(applyAdjust(10, 3, { set: 2 })).toEqual({ error: 'below_reserved' });
    expect(applyAdjust(10, 3, { set: 3 })).toEqual({ stock: 3 });
    expect(applyAdjust(10, 3, { delta: -7 })).toEqual({ stock: 3 });
    expect(applyAdjust(10, 3, { delta: -8 })).toEqual({ error: 'below_reserved' });
  });

  it('faixa 0..99.999: -1 e 100.000 recusados, 0 e 99.999 aceitos (sem reserva), com delta e com set', () => {
    expect(applyAdjust(5, 0, { set: -1 })).toEqual({ error: 'out_of_range' });
    expect(applyAdjust(5, 0, { set: MAX_STOCK + 1 })).toEqual({ error: 'out_of_range' });
    expect(applyAdjust(5, 0, { set: 0 })).toEqual({ stock: 0 });
    expect(applyAdjust(5, 0, { set: MAX_STOCK })).toEqual({ stock: MAX_STOCK });
    expect(applyAdjust(MAX_STOCK, 0, { delta: 1 })).toEqual({ error: 'out_of_range' });
    expect(applyAdjust(0, 0, { delta: -1 })).toEqual({ error: 'out_of_range' });
  });

  it('valor não inteiro nunca vira estoque (1,5 e NaN)', () => {
    expect(applyAdjust(5, 0, { set: 1.5 })).toEqual({ error: 'out_of_range' });
    expect(applyAdjust(5, 0, { delta: Number.NaN })).toEqual({ error: 'out_of_range' });
  });

  it('o resultado de um ajuste válido nunca deixa disponível negativo (propriedade sobre uma grade de valores)', () => {
    for (let stock = 0; stock <= 12; stock++) {
      for (let reserved = 0; reserved <= stock; reserved++) {
        for (const delta of [-13, -5, -1, 0, 1, 7]) {
          const result = applyAdjust(stock, reserved, { delta });
          if ('stock' in result) expect(available(result.stock, reserved)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('estoque baixo e gatilho de aviso (R-14, O2-EST-02)', () => {
  it('selo "Baixo" com disponível <= limite: 3 é baixo, 4 não', () => {
    expect(isLow(3, 3)).toBe(true);
    expect(isLow(4, 3)).toBe(false);
  });

  it('avisa 1 vez: 3 envia, 2 não, sobe para 10 rearma, volta a 3 e envia de novo', () => {
    let armed = true;
    const step = (availableNow: number) => {
      const out = lowStockTransition(availableNow, 3, armed);
      armed = out.armed;
      return out.notify;
    };
    expect(step(3)).toBe(true);
    expect(step(2)).toBe(false);
    expect(step(0)).toBe(false);
    expect(step(10)).toBe(false);
    expect(armed).toBe(true);
    expect(step(3)).toBe(true);
  });

  it('acima do limite nunca avisa, mesmo desarmado', () => {
    expect(lowStockTransition(4, 3, false)).toEqual({ notify: false, armed: true });
  });
});

describe('visibilidade do produto e oferta (RN-03, O2-VAR-03)', () => {
  const base = { status: 'active', moderationStatus: 'ok', storeVisible: true, variantsAvailable: [0, 0] };

  it('todas as variações esgotadas: sai das ofertas e da busca, mas segue na página da loja como "Indisponível"', () => {
    expect(isOfferable([0, 0])).toBe(false);
    expect(isProductVisible(base)).toBe(true);
  });

  it('basta uma variação com estoque para ser ofertável', () => {
    expect(isOfferable([0, 1])).toBe(true);
    expect(isOfferable([])).toBe(false);
  });

  it('cada critério desligado isoladamente deixa o produto invisível: pausado, rascunho, removido, pausado pelo admin, loja invisível', () => {
    expect(isProductVisible({ ...base, status: 'paused' })).toBe(false);
    expect(isProductVisible({ ...base, status: 'draft' })).toBe(false);
    expect(isProductVisible({ ...base, status: 'archived' })).toBe(false);
    expect(isProductVisible({ ...base, moderationStatus: 'removed' })).toBe(false);
    expect(isProductVisible({ ...base, moderationStatus: 'paused' })).toBe(false);
    expect(isProductVisible({ ...base, storeVisible: false })).toBe(false);
  });

  it('produto sinalizado para revisão NÃO é bloqueado (WB-107 C3): segue visível', () => {
    expect(isProductVisible({ ...base, moderationStatus: 'review' })).toBe(true);
  });
});
