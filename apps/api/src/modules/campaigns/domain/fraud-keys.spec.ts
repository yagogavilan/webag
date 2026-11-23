import { addressIdentifier, hmacOf, hmacsOf, normalizeIdentifier, rateKey } from './fraud-keys.js';

const K1 = 'k'.repeat(32);
const K2 = 'z'.repeat(32);

describe('antifraude: HMAC dos identificadores (WB-344, SEC-225)', () => {
  it('só sai HMAC SHA-256 hexadecimal de 64 caracteres, nunca o dado', () => {
    const h = hmacOf(K1, 'document', '12345678909');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain('12345678909');
  });
  it('domínio separado: o mesmo valor em outro tipo dá outro HMAC; outra chave também', () => {
    expect(hmacOf(K1, 'device', 'abc')).not.toBe(hmacOf(K1, 'account', 'abc'));
    expect(hmacOf(K1, 'device', 'abc')).not.toBe(hmacOf(K2, 'device', 'abc'));
  });
  it('rotação: a escrita usa a chave atual e a leitura confere a atual e a anterior', () => {
    const both = hmacsOf({ current: K1, previous: K2 }, 'device', 'abc');
    expect(both.current).toBe(hmacOf(K1, 'device', 'abc'));
    expect(both.all).toEqual([hmacOf(K1, 'device', 'abc'), hmacOf(K2, 'device', 'abc')]);
    expect(hmacsOf({ current: K1, previous: null }, 'device', 'abc').all).toHaveLength(1);
  });
  it('SEC-225: o endereço é CEP + número normalizados e o complemento NÃO entra', () => {
    expect(addressIdentifier('07.700-000', ' 12-A ')).toBe('07700000:12a');
    expect(addressIdentifier('07700000', '12A')).toBe(addressIdentifier('07700-000', '12 a'));
    expect(addressIdentifier('0770', '12')).toBeNull();
    expect(addressIdentifier('07700000', '')).toBeNull();
  });
  it('documento só com 11 dígitos; chave de Redis nunca leva o IP ou o aparelho em claro', () => {
    expect(normalizeIdentifier('document', '123.456.789-09')).toBe('12345678909');
    expect(normalizeIdentifier('document', '123')).toBeNull();
    const key = rateKey({ current: K1, previous: null }, 'ip', '203.0.113.7');
    expect(key).toMatch(/^coupon-attempt:ip:[a-f0-9]{64}$/);
    expect(key).not.toContain('203.0.113.7');
  });
});
