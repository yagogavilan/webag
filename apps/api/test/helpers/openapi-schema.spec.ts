import { validateAgainst, validateValue } from './openapi-schema.js';

/**
 * A1 (review R1.1): o validador mínimo é a prova de contrato do `view-as` e de 3 e2e. Sem teste próprio ele pode parar de rejeitar campo extra sem ninguém ver.
 * Schemas aqui são locais (não dependem do YAML), exceto o último caso, que usa um schema real do contrato.
 */
describe('validador de schema do contrato (test/helpers/openapi-schema.ts)', () => {
  const strict = { type: 'object', required: ['id', 'name'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, count: { type: 'integer', minimum: 0 } } };
  const good = { id: '3f2b8c1e-5d44-4a0b-9d7a-0a6f1f9b2c11', name: 'x', count: 1 };

  it('aceita o objeto que cabe no schema', () => {
    expect(validateValue(strict, good)).toEqual([]);
  });

  it('rejeita campo fora do contrato quando additionalProperties é false', () => {
    expect(validateValue(strict, { ...good, document: '123' })).toEqual(['$.document: campo fora do contrato (additionalProperties: false)']);
  });

  it('rejeita oneOf com 0 casamentos (e com 2)', () => {
    const one = { oneOf: [{ type: 'string' }, { type: 'integer' }] };
    expect(validateValue(one, true)).toEqual(['$: oneOf casou 0 vezes']);
    expect(validateValue({ oneOf: [{ type: 'string', maxLength: 1 }, { type: 'string', minLength: 3 }] }, 'ab')).toEqual(['$: oneOf casou 0 vezes']);
    expect(validateValue({ oneOf: [{ type: 'string' }, { type: 'string', minLength: 1 }] }, 'ab')).toEqual(['$: oneOf casou 2 vezes']);
  });

  it('rejeita tipo errado', () => {
    expect(validateValue(strict, { ...good, count: '1' })).toEqual(['$.count: tipo string, esperado integer']);
  });

  it('rejeita obrigatório ausente', () => {
    expect(validateValue(strict, { id: good.id })).toEqual(['$.name: obrigatório ausente']);
  });

  it('palavra-chave desconhecida lança em vez de passar', () => {
    expect(() => validateValue({ type: 'string', uniqueItems: true }, 'x')).toThrow(/não suportada/);
  });

  it('format desconhecido lança em vez de passar em silêncio; os formatos do contrato são checados', () => {
    expect(() => validateValue({ type: 'string', format: 'ipv4' }, '1.2.3.4')).toThrow(/format/);
    expect(validateValue({ type: 'string', format: 'email' }, 'sem-arroba')).toEqual(['$: formato email']);
    expect(validateValue({ type: 'string', format: 'email' }, 'a@b.co')).toEqual([]);
    expect(validateValue({ type: 'string', format: 'uuid' }, 'nao-uuid')).toEqual(['$: formato uuid']);
  });

  it('contra um schema real do contrato: campo extra em StoreViewAs é rejeitado', () => {
    expect(validateAgainst('StoreViewAs', { document: '123' }).some((e) => e.includes('campo fora do contrato') || e.includes('obrigatório ausente'))).toBe(true);
  });
});
