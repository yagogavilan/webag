import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { bulkConflictMessage } from '@/lib/api/catalog';
import type { BulkResult } from '@/lib/api/catalog';
import { canApplyPreview, newIdempotencyKey, priceAdjustApplyBody, priceAdjustPreviewBody } from './bulk';

const item = (productId: string, version: number, exceedsLimit = false) => ({ productId, name: productId, version, fromCents: 1000, toCents: 1100, changePct: 10, youReceiveCents: null, exceedsLimit });
const result = (over: Partial<BulkResult> = {}): BulkResult => ({ dryRun: true, willChange: 2, changed: 0, blocked: [], preview: [item('a', 2), item('b', 7)], requiresConfirmation: false, ...over });
const intent = { productIds: ['a', 'b'], unit: 'percent' as const, value: -10 };

describe('corpo do reajuste em massa', () => {
  it('a prévia é dryRun sem versões', () => {
    expect(priceAdjustPreviewBody(intent)).toEqual({ productIds: ['a', 'b'], dryRun: true, action: { type: 'price_adjust', mode: 'percent', value: -10 } });
  });
  it('aplicar leva expectedVersions de cada item da prévia, dryRun false e sem confirmLargeChange', () => {
    expect(priceAdjustApplyBody(intent, result(), false)).toEqual({
      productIds: ['a', 'b'],
      dryRun: false,
      expectedVersions: [{ productId: 'a', version: 2 }, { productId: 'b', version: 7 }],
      action: { type: 'price_adjust', mode: 'percent', value: -10 },
    });
  });
  it('confirmLargeChange só quando a prévia pediu e a caixa foi marcada', () => {
    const big = result({ requiresConfirmation: true });
    expect(priceAdjustApplyBody(intent, big, true).confirmLargeChange).toBe(true);
    expect(priceAdjustApplyBody(intent, big, false).confirmLargeChange).toBeUndefined();
    expect(priceAdjustApplyBody(intent, result(), true).confirmLargeChange).toBeUndefined();
  });
  it('só aplica prévia sem bloqueio, com itens e (se pediu) confirmada', () => {
    expect(canApplyPreview(undefined, false)).toBe(false);
    expect(canApplyPreview(result(), false)).toBe(true);
    expect(canApplyPreview(result({ blocked: [{ productId: 'a', name: 'a', reason: 'x' }] }), true)).toBe(false);
    expect(canApplyPreview(result({ preview: [] }), true)).toBe(false);
    expect(canApplyPreview(result({ requiresConfirmation: true }), false)).toBe(false);
    expect(canApplyPreview(result({ requiresConfirmation: true }), true)).toBe(true);
  });
  it('chave de idempotência cumpre o padrão do servidor e é única', () => {
    const keys = new Set(Array.from({ length: 20 }, newIdempotencyKey));
    expect(keys.size).toBe(20);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  });
});

describe('mensagem do 409 BULK_VERSION_CONFLICT', () => {
  const conflict = (names: string[]) => new ApiError({ status: 409, code: 'BULK_VERSION_CONFLICT', title: 't', problem: { conflicts: names.map((name) => ({ productId: name, name, currentVersion: 5 })) } });
  it('nomeia um, vários e muitos produtos', () => {
    expect(bulkConflictMessage(conflict(['Boné']))).toMatch(/^Boné mudou depois da prévia/);
    expect(bulkConflictMessage(conflict(['A', 'B']))).toMatch(/^A, B mudaram/);
    expect(bulkConflictMessage(conflict(['A', 'B', 'C', 'D', 'E']))).toMatch(/^A, B, C e mais 2 mudaram/);
    expect(bulkConflictMessage(conflict([]))).toMatch(/^Alguns produtos mudaram/);
  });
  it('diz que nada foi aplicado e que a prévia foi atualizada', () => {
    expect(bulkConflictMessage(conflict(['A']))).toContain('Nada foi aplicado');
    expect(bulkConflictMessage(conflict(['A']))).toContain('Atualizamos a prévia');
  });
});
