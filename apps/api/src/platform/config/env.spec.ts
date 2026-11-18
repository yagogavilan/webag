import { DEV_AUTH_HMAC_KEY, DEV_JWT_ACCESS_SECRET, validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('aplica padrões e converte tipos', () => {
    const env = validateEnv({ ...base, API_PORT: '4000', CORS_ORIGINS: 'http://a.test, http://b.test,' });

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.API_DOCS_ENABLED).toBeUndefined();
  });

  it('recusa subir sem DATABASE_URL e não vaza valores na mensagem', () => {
    expect(() => validateEnv({ REDIS_URL: 'redis://secret-host:6379' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ REDIS_URL: 'redis://secret-host:6379' })).not.toThrow(/secret-host/);
  });

  it('recusa URL de banco com protocolo errado', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('recusa porta fora do intervalo', () => {
    expect(() => validateEnv({ ...base, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  describe('produção (SEC-080, SEC-036)', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a-very-long-random-production-secret-0123456789',
      AUTH_HMAC_KEY: 'another-very-long-random-production-hmac-key-9876543210',
      CORS_ORIGINS: 'https://app.webag.com.br',
      PAYMENT_PROVIDER: 'mercadopago',
      MP_ACCESS_TOKEN: 'APP_USR-123',
      MP_WEBHOOK_SECRET: 'segredo-do-webhook-123456',
      PAYMENT_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    };

    it('aceita uma configuração de produção completa', () => {
      expect(() => validateEnv(prod)).not.toThrow();
    });

    it.each([
      ['JWT_ACCESS_SECRET igual ao de desenvolvimento', { JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET }, /JWT_ACCESS_SECRET/],
      ['JWT_ACCESS_SECRET curto', { JWT_ACCESS_SECRET: 'curto' }, /JWT_ACCESS_SECRET/],
      ['AUTH_HMAC_KEY de desenvolvimento', { AUTH_HMAC_KEY: DEV_AUTH_HMAC_KEY }, /AUTH_HMAC_KEY/],
      ['CORS_ORIGINS vazio', { CORS_ORIGINS: '' }, /CORS_ORIGINS/],
      ['CORS_ORIGINS com *', { CORS_ORIGINS: '*' }, /CORS_ORIGINS/],
      ['/docs ligado', { API_DOCS_ENABLED: 'true' }, /API_DOCS_ENABLED/],
      ['provedor fake', { PAYMENT_PROVIDER: 'fake' }, /PAYMENT_PROVIDER/],
      ['MP sem segredo de webhook', { MP_WEBHOOK_SECRET: undefined }, /MP_WEBHOOK_SECRET/],
      ['credencial de teste do MP', { MP_ACCESS_TOKEN: 'TEST-123' }, /MP_ACCESS_TOKEN/],
      ['chave de cifra ausente', { PAYMENT_TOKEN_ENC_KEY: undefined }, /PAYMENT_TOKEN_ENC_KEY/],
      ['chave de cifra com tamanho errado', { PAYMENT_TOKEN_ENC_KEY: Buffer.alloc(16).toString('base64') }, /PAYMENT_TOKEN_ENC_KEY/],
    ])('recusa subir com %s, sem imprimir o valor', (_name, override, pattern) => {
      let message = '';
      try {
        validateEnv({ ...prod, ...override });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(pattern);
      for (const secret of [DEV_JWT_ACCESS_SECRET, 'TEST-123', 'a-very-long-random-production-secret-0123456789']) {
        expect(message).not.toContain(secret);
      }
    });

    it('fora de produção os padrões de desenvolvimento são aceitos', () => {
      expect(() => validateEnv(base)).not.toThrow();
    });
  });
});
