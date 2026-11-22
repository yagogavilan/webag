import { gtinCheckDigit, isValidGtin } from './ean.js';

describe('EAN/GTIN (RN-Q7)', () => {
  it.each(['7891000100103', '4006381333931', '96385074', '036000291452', '10012345678902'])('%s é válido', (code) => expect(isValidGtin(code)).toBe(true));
  it.each(['7891000100104', '123', '', '789100010010', '78910001001031', 'abcdefghijklm', '7891000 100103', '-7891000100103'])('%j é recusado', (code) => expect(isValidGtin(code)).toBe(false));
  it('calcula o dígito verificador', () => {
    expect(gtinCheckDigit('789100010010')).toBe(3);
    expect(gtinCheckDigit('9638507')).toBe(4);
  });
});
