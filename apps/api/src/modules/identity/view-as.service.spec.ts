import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { invalidViewAsHandlers } from './view-as.boot-check.js';
import { classifyViewAsHeader, hashViewAsToken, newViewAsToken, VIEW_AS_TOKEN, viewAsHeaderOccurrences } from './view-as.service.js';

describe('credencial vas_ (WB-352, threat model §14.5)', () => {
  it('tem 32 bytes aleatórios em base64url (43 caracteres), prefixo vas_ e nunca se repete', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newViewAsToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(VIEW_AS_TOKEN);
  });

  it('só o SHA-256 (hex de 64) é guardado e é determinístico', () => {
    const t = newViewAsToken();
    expect(hashViewAsToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashViewAsToken(t)).toBe(hashViewAsToken(t));
    expect(hashViewAsToken(t)).not.toBe(hashViewAsToken(newViewAsToken()));
  });
});

describe('classifyViewAsHeader: códigos da §15.2', () => {
  const ok = newViewAsToken();
  it.each([
    ['vazio', '', 1, 'VIEW_AS_READ_ONLY'],
    ['repetido (duas linhas)', `${ok}, ${ok}`, 2, 'VIEW_AS_READ_ONLY'],
    ['com vírgula', `${ok},`, 1, 'VIEW_AS_READ_ONLY'],
    ['não é texto', undefined, 1, 'VIEW_AS_READ_ONLY'],
    ['formato errado (curto)', 'vas_abc', 1, 'VIEW_AS_EXPIRED'],
    ['formato errado (maiúsculas do prefixo)', ok.replace('vas_', 'VAS_'), 1, 'VIEW_AS_EXPIRED'],
    ['formato errado (com espaço)', ` ${ok}`, 1, 'VIEW_AS_EXPIRED'],
    ['44 caracteres', `${ok}A`, 1, 'VIEW_AS_EXPIRED'],
  ] as const)('%s', (_name, value, occurrences, code) => {
    expect(classifyViewAsHeader(value, occurrences)).toEqual({ ok: false, code });
  });

  it('o formato certo, uma vez só, passa', () => {
    expect(classifyViewAsHeader(ok, 1)).toEqual({ ok: true, token: ok });
  });

  it('conta as linhas X-View-As nos cabeçalhos crus, em qualquer caixa', () => {
    expect(viewAsHeaderOccurrences({ rawHeaders: ['Host', 'a', 'x-view-as', 'x', 'X-VIEW-AS', 'y'] })).toBe(2);
    expect(viewAsHeaderOccurrences({ rawHeaders: ['Host', 'a'] })).toBe(0);
    expect(viewAsHeaderOccurrences({})).toBe(0);
  });
});

describe('verificação de boot: @ViewAs exige @Get e @StorePermission', () => {
  const handler = (over: Partial<{ method: number | undefined; hasStorePermission: boolean }>) => ({ operationId: 'op', controller: 'C', handler: 'h', method: RequestMethod.GET as number | undefined, hasStorePermission: true, ...over });
  it('aceita GET com permissão de loja', () => {
    expect(invalidViewAsHandlers([handler({})])).toEqual([]);
  });
  it.each([[RequestMethod.POST], [RequestMethod.PUT], [RequestMethod.PATCH], [RequestMethod.DELETE], [undefined]])('recusa o método %s', (method) => {
    expect(invalidViewAsHandlers([handler({ method })])).toEqual(['C.h (op)']);
  });
  it('recusa sem @StorePermission (rota sem checagem de loja seria um IDOR)', () => {
    expect(invalidViewAsHandlers([handler({ hasStorePermission: false })])).toEqual(['C.h (op)']);
  });
});
