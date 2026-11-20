import { maskTokenPaths, maskPii, safeErrorMessage } from './mask.js';

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

describe('maskPii: CPF e CNPJ (SEC-140)', () => {
  it('mascara CPF e CNPJ com ou sem pontuação, sem tocar em número menor', () => {
    expect(maskPii('pagador 12345678901 recusado')).toBe('pagador [documento] recusado');
    expect(maskPii('cpf 123.456.789-01 inválido')).toBe('cpf [documento] inválido');
    expect(maskPii('cnpj 12.345.678/0001-95 inválido')).toBe('cnpj [documento] inválido');
    expect(maskPii('12345678000195')).toBe('[documento]');
    expect(maskPii('pedido 4821 e 99 itens')).toBe('pedido 4821 e 99 itens');
  });
});

describe('maskTokenPaths (SEC-171)', () => {
  it('troca o token de uso único por [token] nos três caminhos', () => {
    expect(maskTokenPaths('/v1/data-exports/download/AbC_123-xyzAbC_123-xyz0123456789')).toBe('/v1/data-exports/download/[token]');
    expect(maskTokenPaths('/v1/card-intents/AbC_123-xyzAbC_123-xyz0123456789/pay')).toBe('/v1/card-intents/[token]/pay');
    expect(maskTokenPaths('/pagar/cartao?i=AbC_123-xyzAbC_123-xyz&x=1')).toBe('/pagar/cartao?i=[token]&x=1');
  });
  it('não mexe no resto da URL', () => {
    expect(maskTokenPaths('/v1/orders?limit=20')).toBe('/v1/orders?limit=20');
    expect(maskTokenPaths(undefined)).toBeUndefined();
  });
});
