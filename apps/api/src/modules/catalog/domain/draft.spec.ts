import { copyName, draftExpiresAt, draftExpiresInDays, missingFields, type DraftFacts } from './draft.js';

const base: DraftFacts = { name: 'Camiseta', basePriceCents: 4990, categoryId: 'cat', description: null, photoCount: 1, activeVariantCount: 1, descriptionRule: null };

describe('o que falta para publicar o rascunho', () => {
  it('completo não falta nada', () => expect(missingFields(base)).toEqual([]));
  it('rascunho que acabou de abrir (só a via) falta quase tudo, na ordem do contrato', () => {
    expect(missingFields({ ...base, name: '', basePriceCents: null, categoryId: null, photoCount: 0, activeVariantCount: 0 })).toEqual(['name', 'price', 'photo', 'category', 'stock']);
  });
  it('nome de 1 caractere ainda falta (2 a 80)', () => expect(missingFields({ ...base, name: 'a' })).toEqual(['name']));
  it('só pede descrição quando a categoria exige, com o mínimo dela', () => {
    expect(missingFields({ ...base, description: null })).toEqual([]);
    expect(missingFields({ ...base, descriptionRule: { minChars: 20 }, description: 'curta' })).toEqual(['description']);
    expect(missingFields({ ...base, descriptionRule: { minChars: 20 }, description: 'Perfume amadeirado de 100 ml.' })).toEqual([]);
    expect(missingFields({ ...base, descriptionRule: { minChars: 20 }, description: '   ' + 'x'.repeat(19) + '   ' })).toEqual(['description']);
  });
});

describe('vencimento do rascunho (RN-Q2: 30 dias sem alteração, aviso 3 dias antes)', () => {
  const updated = new Date('2026-11-01T12:00:00Z');
  it('vence 30 dias depois', () => expect(draftExpiresAt(updated, 30).toISOString()).toBe('2026-12-01T12:00:00.000Z'));
  it.each([
    ['2026-11-02T12:00:00Z', 29],
    ['2026-11-28T12:00:00Z', 3],
    ['2026-11-28T12:00:01Z', 3],
    ['2026-12-01T12:00:00Z', 0],
    ['2026-12-20T12:00:00Z', 0],
  ])('em %s faltam %i dias', (now, days) => expect(draftExpiresInDays(draftExpiresAt(updated, 30), new Date(now))).toBe(days));
});

describe('nome da cópia (RN-Q4)', () => {
  it('ganha o sufixo editável', () => expect(copyName('Camiseta básica preta')).toBe('Camiseta básica preta (cópia)'));
  it('nome de 80 caracteres corta o nome, não o sufixo, e fica em até 80', () => {
    const copy = copyName('a'.repeat(80));
    expect(copy.endsWith(' (cópia)')).toBe(true);
    expect([...copy].length).toBe(80);
  });
});
