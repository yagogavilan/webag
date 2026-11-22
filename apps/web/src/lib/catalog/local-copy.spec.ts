import { beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_COPY_TTL_MS, PASTE_COPY_TTL_MS, hasUnsentCopies, purgeLocalCopies, readPasteCopy, readQuickCopy, removeQuickCopy, writePasteCopy, writeQuickCopy, type QuickCopy } from './local-copy';

const copy = (over: Partial<QuickCopy> = {}): QuickCopy => ({ name: 'Camiseta', priceCents: 4990, stockText: '1', categoryId: 'c1', description: '', imageIds: ['a'], unsent: true, ...over });
const T0 = 1_700_000_000_000;

beforeEach(() => localStorage.clear());

describe('cópia local do cadastro (RN-Q2, C-CAD-08, WB-371 C7)', () => {
  it('grava e lê por usuário e loja; outro usuário e outra loja não veem', () => {
    writeQuickCopy('u1', 's1', 'p1', copy(), T0);
    expect(readQuickCopy('u1', 's1', 'p1', T0)?.name).toBe('Camiseta');
    expect(readQuickCopy('u2', 's1', 'p1', T0)).toBeNull();
    expect(readQuickCopy('u1', 's2', 'p1', T0)).toBeNull();
  });
  it('vence em 30 dias e a leitura apaga a cópia vencida', () => {
    writeQuickCopy('u1', 's1', 'p1', copy(), T0);
    expect(readQuickCopy('u1', 's1', 'p1', T0 + LOCAL_COPY_TTL_MS + 1)).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it('só guarda o que o formulário tem: nada de e-mail, token ou nome da pessoa', () => {
    writeQuickCopy('u1', 's1', 'p1', copy(), T0);
    const raw = [...Array(localStorage.length).keys()].map((i) => localStorage.getItem(localStorage.key(i) as string)).join('');
    expect(Object.keys(JSON.parse(raw).data).sort()).toEqual(['categoryId', 'description', 'imageIds', 'name', 'priceCents', 'stockText', 'unsent']);
    expect(raw).not.toMatch(/token|@|senha/i);
  });
  it('conteúdo corrompido ou de versão desconhecida é ignorado', () => {
    localStorage.setItem('webag:lojista:v1:u1:s1:quick:p1', '{nao-json');
    expect(readQuickCopy('u1', 's1', 'p1')).toBeNull();
    localStorage.setItem('webag:lojista:v1:u1:s1:quick:p2', JSON.stringify({ v: 9, savedAt: Date.now(), data: {} }));
    expect(readQuickCopy('u1', 's1', 'p2')).toBeNull();
  });
  it('texto colado fica 24 h; vazio apaga', () => {
    writePasteCopy('u1', 's1', 'Bermuda 79,90', T0);
    expect(readPasteCopy('u1', 's1', T0 + PASTE_COPY_TTL_MS - 1)).toBe('Bermuda 79,90');
    expect(readPasteCopy('u1', 's1', T0 + PASTE_COPY_TTL_MS + 1)).toBeNull();
    writePasteCopy('u1', 's1', 'x');
    writePasteCopy('u1', 's1', '  ');
    expect(readPasteCopy('u1', 's1')).toBeNull();
  });
  it('avisa do que não foi enviado e apaga tudo ao sair', () => {
    expect(hasUnsentCopies('u1')).toBe(false);
    writeQuickCopy('u1', 's1', 'p1', copy({ unsent: false }));
    expect(hasUnsentCopies('u1')).toBe(false);
    writeQuickCopy('u1', 's1', 'p2', copy());
    writePasteCopy('u1', 's1', 'lista');
    expect(hasUnsentCopies('u1')).toBe(true);
    expect(hasUnsentCopies('u2')).toBe(false);
    removeQuickCopy('u1', 's1', 'p2');
    expect(hasUnsentCopies('u1')).toBe(true);
    localStorage.setItem('outra-chave', 'fica');
    purgeLocalCopies();
    expect(hasUnsentCopies('u1')).toBe(false);
    expect(localStorage.getItem('outra-chave')).toBe('fica');
    expect(localStorage.length).toBe(1);
  });
});
