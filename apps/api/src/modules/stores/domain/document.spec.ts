import { isValidCnpj, isValidCpf, maskDocument, normalizeDocument } from './document.js';

describe('CPF e CNPJ (WB-051 C1)', () => {
  it('aceita CPF válido com e sem máscara; o mesmo documento normaliza igual', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
    expect(normalizeDocument('529.982.247-25')).toBe(normalizeDocument('52998224725'));
  });

  it.each(['111.111.111-11', '000.000.000-00', '529.982.247-24', '5299822472', '529982247250', 'abc.def.ghi-jk'])('recusa CPF inválido: %s', (value) => {
    expect(isValidCpf(value)).toBe(false);
  });

  it('aceita CNPJ numérico e o ALFANUMÉRICO (exemplo da Receita) [HIPÓTESE R-18]; recusa dígito errado e tamanho errado', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('12.ABC.345/01DE-36')).toBe(false);
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    // letra nos 2 dígitos verificadores nunca vale
    expect(isValidCnpj('12ABC34501DEAB')).toBe(false);
  });

  it('mascara tudo menos os 2 últimos caracteres (SEC-023)', () => {
    expect(maskDocument('529.982.247-25')).toBe('*********25');
  });
});
