import { maskPii, safeErrorMessage } from './mask.js';

describe('maskPii (SEC-128)', () => {
  it('mascara e-mail e telefone em mensagens de erro de terceiros', () => {
    expect(maskPii('550 5.1.1 <maria.silva@gmail.com>: user unknown')).toBe('550 5.1.1 <m***@gmail.com>: user unknown');
    expect(maskPii('falha para (11) 98888-7777')).toBe('falha para [telefone]');
    expect(maskPii('envio a +55 11 988887777 recusado')).toBe('envio a [telefone] recusado');
  });

  it('não altera texto sem dado pessoal e aceita erro não-Error', () => {
    expect(maskPii('ECONNREFUSED 127.0.0.1:6379')).toBe('ECONNREFUSED 127.0.0.1:6379');
    expect(safeErrorMessage(new Error('x@y.com'))).toBe('x***@y.com');
    expect(safeErrorMessage('texto')).toBe('texto');
  });
});

describe('maskCoordinates (LGPD)', () => {
  it('troca lat e lng da query e preserva o resto', async () => {
    const { maskCoordinates } = await import('./mask.js');
    expect(maskCoordinates('/v1/home?lat=-23.28&lng=-46.74&mode=delivery')).toBe('/v1/home?lat=[redacted]&lng=[redacted]&mode=delivery');
    expect(maskCoordinates('/v1/search/stores?q=pao&lng=-46.7&lat=-23.2')).toBe('/v1/search/stores?q=pao&lng=[redacted]&lat=[redacted]');
    expect(maskCoordinates('/v1/regions')).toBe('/v1/regions');
    expect(maskCoordinates(undefined)).toBeUndefined();
  });
});
