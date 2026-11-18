import { canTransitionStore, STORE_STATUSES, STORE_TRANSITIONS, type StoreActor } from './state.js';

describe('máquina de estados da loja (RN-16, R-29)', () => {
  const actors: StoreActor[] = ['merchant', 'admin'];

  it('toda transição da tabela passa e TODA outra combinação falha', () => {
    for (const from of STORE_STATUSES) {
      for (const to of STORE_STATUSES) {
        for (const actor of actors) {
          const expected = STORE_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor);
          expect(canTransitionStore(from, to, actor), `${from} -> ${to} (${actor})`).toBe(expected);
        }
      }
    }
  });

  it('casos de borda citados no PRD: aprovar rascunho, reaprovar aprovada, suspender recusada, recusada/suspensa direto para aprovada pelo caminho de aprovação', () => {
    expect(canTransitionStore('draft', 'approved', 'admin')).toBe(false);
    expect(canTransitionStore('approved', 'approved', 'admin')).toBe(false);
    expect(canTransitionStore('rejected', 'suspended', 'admin')).toBe(false);
    expect(canTransitionStore('rejected', 'approved', 'admin')).toBe(false);
    expect(canTransitionStore('approved', 'in_review', 'merchant')).toBe(false);
    expect(canTransitionStore('rejected', 'in_review', 'merchant')).toBe(false);
  });

  it('lojista nunca decide: só envia e reenvia', () => {
    for (const t of STORE_TRANSITIONS.filter((x) => x.actor === 'merchant')) expect(['draft', 'correction_requested']).toContain(t.from);
    expect(canTransitionStore('suspended', 'approved', 'merchant')).toBe(false);
  });
});
