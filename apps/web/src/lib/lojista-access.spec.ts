import { describe, expect, it } from 'vitest';
import type { MerchantStore } from './api/lojista';
import { isOnboarding, onboardingPath, resumeStep, safeLojistaNext, visibleLojistaNav } from './lojista-access';

const store = (over: Partial<MerchantStore> = {}) => ({ status: 'draft', role: 'owner', step: 0, ...over }) as MerchantStore;

describe('navegação do lojista', () => {
  it('o dono vê Equipe; o funcionário, não (RN-13)', () => {
    expect(visibleLojistaNav(store()).map((i) => i.section)).toEqual(['inicio', 'pedidos', 'trocas', 'produtos', 'financeiro', 'loja', 'equipe']);
    expect(visibleLojistaNav(store({ role: 'staff' })).map((i) => i.section)).toEqual(['inicio', 'pedidos', 'trocas', 'produtos']);
  });
});

describe('retomada do cadastro (WB-051 C4)', () => {
  it.each([
    [null, '1'],
    [0, '1'],
    [1, '2'],
    [3, '4'],
    [4, 'revisao'],
  ])('última etapa concluída %s abre a etapa %s', (step, expected) => {
    expect(resumeStep(step === null ? null : store({ step }))).toBe(expected);
    expect(onboardingPath(expected as never)).toBe(`/lojista/onboarding/${expected}`);
  });

  it('só rascunho (ou ainda sem loja) é "em cadastro"', () => {
    expect(isOnboarding(null)).toBe(true);
    expect(isOnboarding(store())).toBe(true);
    expect(isOnboarding(store({ status: 'in_review' }))).toBe(false);
  });
});

describe('safeLojistaNext', () => {
  it.each(['/lojista/equipe', '/lojista/onboarding/3?x=1'])('aceita %s', (v) => expect(safeLojistaNext(v)).toBe(v));
  it.each([null, '', 'https://evil.com', '//evil.com', '/admin', '/lojista//x\\y', '/lojista/entrar', '/lojista/cadastro?email=a'])('rejeita %s', (v) => expect(safeLojistaNext(v)).toBeNull());
});
