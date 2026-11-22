import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { Product } from '@/lib/api/catalog';
import { QUICK_MESSAGES, fieldErrorFrom, firstErrorField, intentFor, isPublishedAsTyped, missingText, newIntentKey, parseQuickStock, savedAgo, toQuickBody, uploadRetryDelay, validateQuick, UPLOAD_WAIT_MAX_MS } from './quick';

const ctx = { photos: 1, descriptionRequired: false, descriptionMin: 20, gradeRows: 0 };
const ok = { name: 'Camiseta', priceCents: 4990, stockText: '1', categoryId: 'c1', description: '' };
const problem = (code: string, status: number, fields: { field: string; message: string }[] = []) => new ApiError({ status, code, title: code, fields });

describe('validateQuick (RN-Q1, mensagens do §7 da spec)', () => {
  it('nome, preço, foto e categoria obrigatórios', () => {
    const errors = validateQuick({ ...ok, name: ' ', priceCents: null, categoryId: '' }, { ...ctx, photos: 0 });
    expect(errors).toEqual({ name: 'Escreva o nome do produto.', price: 'Informe o preço, ex.: 49,90.', photo: 'Falta a foto. Tire uma foto do produto.', category: 'Escolha a categoria.' });
    expect(firstErrorField(errors)).toBe('photo');
  });
  it('nome com 1 letra ou mais de 80; preço acima do máximo; quantidade fora de 0 a 99.999', () => {
    expect(validateQuick({ ...ok, name: 'A' }, ctx).name).toBe('Use ao menos 2 caracteres.');
    expect(validateQuick({ ...ok, name: 'a'.repeat(81) }, ctx).name).toBe('Use até 80 caracteres.');
    expect(validateQuick({ ...ok, priceCents: 10_000_000 }, ctx).price).toBe('O preço máximo é R$ 99.999,99.');
    expect(validateQuick({ ...ok, stockText: '100000' }, ctx).stock).toBe('Use um número de 0 a 99.999.');
    expect(validateQuick({ ...ok, stockText: '0' }, ctx).stock).toBeUndefined();
  });
  it('descrição obrigatória por categoria (mínimo do modelo)', () => {
    const rule = { ...ctx, descriptionRequired: true };
    expect(validateQuick({ ...ok, description: 'curta' }, rule).description).toBe('Escreva ao menos 20 caracteres sobre o produto.');
    expect(validateQuick({ ...ok, description: 'x'.repeat(20) }, rule).description).toBeUndefined();
  });
  it('com grade a quantidade simples não vale', () => {
    expect(validateQuick({ ...ok, stockText: 'abc' }, { ...ctx, gradeRows: 3 }).stock).toBeUndefined();
  });
  it('quantidade vazia vale o padrão 1', () => {
    expect(parseQuickStock('')).toBe(1);
    expect(toQuickBody({ ...ok, stockText: '' }, ['a']).stock).toBe(1);
  });
});

describe('Idempotency-Key por intenção', () => {
  const body = toQuickBody(ok, ['a']);
  it('a chave tem só [A-Za-z0-9_-] e de 8 a 80 caracteres (o BFF recusa o resto)', () => {
    for (let i = 0; i < 20; i += 1) expect(newIntentKey('qp')).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  });
  it('mesmo corpo reaproveita a chave; corpo diferente gera outra (senão 422 IDEMPOTENCY_KEY_REUSED)', () => {
    const first = intentFor(null, body, 'qp');
    expect(intentFor(first, { ...body }, 'qp')).toBe(first);
    expect(intentFor(first, { ...body, basePriceCents: 5990 }, 'qp').key).not.toBe(first.key);
  });
});

describe('UPLOAD_NOT_READY (C6)', () => {
  it('espera 1 a 3 s entre tentativas e desiste em 30 s', () => {
    expect(UPLOAD_WAIT_MAX_MS).toBe(30_000);
    expect(uploadRetryDelay(0)).toBe(1000);
    expect(uploadRetryDelay(50)).toBe(3000);
  });
});

describe('C15: o produto ATIVO com os dados digitados vale como sucesso', () => {
  const product = (over: Partial<Product>) => ({ name: 'Camiseta', basePriceCents: 4990, categoryId: 'c1', status: 'active', ...over }) as Product;
  it('mesmos dados: sim; outro preço, outro nome ou ainda rascunho: não', () => {
    expect(isPublishedAsTyped(product({}), ok)).toBe(true);
    expect(isPublishedAsTyped(product({ basePriceCents: 100 }), ok)).toBe(false);
    expect(isPublishedAsTyped(product({ name: 'Outro' }), ok)).toBe(false);
    expect(isPublishedAsTyped(product({ status: 'draft' }), ok)).toBe(false);
  });
});

describe('erro do servidor no campo certo (C17)', () => {
  it('mapeia categoria proibida, preço, descrição e PRODUCT_INCOMPLETE', () => {
    expect(fieldErrorFrom(problem('CATEGORY_FORBIDDEN', 422))).toEqual({ field: 'category', message: QUICK_MESSAGES.forbidden });
    expect(fieldErrorFrom(problem('PRICE_OUT_OF_RANGE', 422))?.field).toBe('price');
    expect(fieldErrorFrom(problem('DESCRIPTION_REQUIRED', 422), 30)?.message).toContain('30');
    expect(fieldErrorFrom(problem('PRODUCT_INCOMPLETE', 422, [{ field: 'imageIds', message: 'x' }]))?.field).toBe('photo');
    expect(fieldErrorFrom(problem('OUTRO', 500))).toBeNull();
    expect(fieldErrorFrom(new Error('x'))).toBeNull();
  });
});

describe('textos da lista de rascunhos', () => {
  it('o que falta', () => {
    expect(missingText([])).toBe('Pronto para publicar');
    expect(missingText(['photo'])).toBe('Falta a foto');
    expect(missingText(['price', 'photo'])).toBe('Falta o preço e a foto');
  });
  it('salvo há ...', () => {
    const now = new Date('2026-11-22T12:00:00Z').getTime();
    expect(savedAgo('2026-11-22T11:59:40Z', now)).toBe('salvo agora');
    expect(savedAgo('2026-11-22T10:00:00Z', now)).toBe('salvo há 2 h');
    expect(savedAgo('2026-11-20T12:00:00Z', now)).toBe('salvo há 2 dias');
  });
});
