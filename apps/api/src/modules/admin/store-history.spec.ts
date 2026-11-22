import { describe, expect, it } from 'vitest';
import { actionsOfType, actorKindOf, decodeReason, encodeReason, historyTypeOf, STORE_HISTORY_TYPES, summaryOf, targetTypeOf } from './store-history.js';

describe('histórico por loja (WB-350 C4)', () => {
  it.each([
    ['store.hours', 'hours'], ['store.holidays', 'holidays'], ['store.delivery', 'delivery'], ['store.pickup', 'pickup'], ['store.exchange_policy', 'exchange_policy'],
    ['store.pause', 'pause'], ['store.resume', 'pause'], ['store.update', 'profile'], ['store.approve', 'status'], ['store.suspend', 'status'], ['store.reactivate', 'status'],
    ['store.data_review_reject', 'status'], ['commission.store.set', 'commission'], ['view_as.open', 'access'], ['view_as.close', 'access'], ['view_as.denied', 'access'],
    ['product.price_adjust', 'price'], ['product.stock_adjust', 'stock'], ['product.update', 'catalog'], ['product.bulk_pause', 'bulk'], ['store.document_view', 'other'], ['algo.novo', 'other'],
  ])('%s é do tipo %s', (action, type) => {
    expect(historyTypeOf(action)).toBe(type);
  });

  it('todo tipo do contrato tem rótulo, e o filtro por tipo devolve as mesmas ações que o classificador', () => {
    for (const type of STORE_HISTORY_TYPES) {
      expect(summaryOf('x.y', null, null).length).toBeGreaterThan(0);
      const { exact, prefixes } = actionsOfType(type);
      for (const action of exact) expect(historyTypeOf(action), `${type}: ${action}`).toBe(type);
      for (const prefix of prefixes) expect(historyTypeOf(`${prefix}x`), `${type}: ${prefix}`).toBe(type);
    }
  });

  it('o alvo é config, loja, produto ou variação conforme o tipo', () => {
    expect(targetTypeOf('hours')).toBe('config');
    expect(targetTypeOf('pause')).toBe('config');
    expect(targetTypeOf('profile')).toBe('store');
    expect(targetTypeOf('access')).toBe('store');
    expect(targetTypeOf('price')).toBe('product');
    expect(targetTypeOf('stock')).toBe('variant');
  });

  it('o resumo nunca traz texto livre: só frases fixas e o novo estado', () => {
    expect(summaryOf('store.suspend', { status: 'approved' }, { status: 'suspended' })).toBe('Loja suspensa');
    expect(summaryOf('store.resume', null, null)).toBe('Loja reaberta (pausa encerrada)');
    expect(summaryOf('store.update', { name: 'A' }, { name: 'Maria Souza' })).toBe('Dados da loja alterados');
  });

  it('motivo: codifica e decodifica `codigo|nota`; texto fora do catálogo vira nulo', () => {
    const codes = ['requested_by_merchant', 'error_fix'];
    expect(encodeReason({ code: 'error_fix' })).toBe('error_fix');
    expect(encodeReason({ code: 'requested_by_merchant', note: 'WhatsApp, 24/11 | João' })).toBe('requested_by_merchant|WhatsApp, 24/11 | João');
    expect(decodeReason('requested_by_merchant|WhatsApp, 24/11 | João', codes)).toEqual({ code: 'requested_by_merchant', note: 'WhatsApp, 24/11 | João' });
    expect(decodeReason('error_fix', codes)).toEqual({ code: 'error_fix' });
    expect(decodeReason('Denúncia de produto proibido', codes)).toBeNull();
    expect(decodeReason(null, codes)).toBeNull();
  });

  it('o ator é admin pelo perfil, sistema sem ator, lojista nos demais casos', () => {
    expect(actorKindOf(null, null)).toBe('system');
    expect(actorKindOf('u1', 'operations')).toBe('admin');
    expect(actorKindOf('u1', 'customer,merchant')).toBe('merchant');
    expect(actorKindOf('u1', null)).toBe('merchant');
  });
});
