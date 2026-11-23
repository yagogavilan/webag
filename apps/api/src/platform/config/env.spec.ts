import { DEV_AUTH_HMAC_KEY, DEV_CODE_HMAC_KEY, DEV_COUPON_FRAUD_HMAC_KEY, DEV_JWT_ACCESS_SECRET, DEV_MFA_ENC_KEY, DEV_RECOVERY_HMAC_KEY, validateEnv } from './env.js';

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

  describe('Mercado Pago ativo (WB-160 C3)', () => {
    it('em QUALQUER ambiente, sem as chaves a aplicação não sobe e a mensagem diz quais faltam (sem valores)', () => {
      let message = '';
      try {
        validateEnv({ ...base, PAYMENT_PROVIDER: 'mercadopago', MP_ACCESS_TOKEN: 'TEST-123' });
      } catch (error) {
        message = (error as Error).message;
      }
      for (const name of ['MP_WEBHOOK_SECRET', 'MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_OAUTH_REDIRECT_URI']) expect(message).toContain(name);
      expect(message).not.toContain('MP_ACCESS_TOKEN');
      expect(message).not.toContain('TEST-123');
    });

    it('com todas as chaves sobe em desenvolvimento (token de teste vale fora de produção)', () => {
      expect(() => validateEnv({ ...base, PAYMENT_PROVIDER: 'mercadopago', MP_ACCESS_TOKEN: 'TEST-123', MP_WEBHOOK_SECRET: 'segredo-do-webhook-123456', MP_CLIENT_ID: '1', MP_CLIENT_SECRET: 'x', MP_OAUTH_REDIRECT_URI: 'https://app.webag.test/mp' })).not.toThrow();
    });

    it('fake continua sendo o padrão e não exige nada', () => {
      expect(() => validateEnv({ ...base })).not.toThrow();
    });
  });

  describe('produção (SEC-080, SEC-036)', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a-very-long-random-production-secret-0123456789',
      AUTH_HMAC_KEY: 'another-very-long-random-production-hmac-key-9876543210',
      CODE_HMAC_KEY: 'code-hmac-very-long-random-production-key-1111111111',
      RECOVERY_HMAC_KEY: 'recovery-hmac-very-long-random-production-key-2222222',
      MFA_ENC_KEY: 'yet-another-very-long-random-production-mfa-key-1234567890',
      COUPON_FRAUD_HMAC_KEY: 'coupon-fraud-hmac-very-long-random-production-key-77777777',
      TRUST_PROXY: '1',
      API_PUBLIC_URL: 'https://api.webag.com.br',
      WEB_PUBLIC_URL: 'https://webag.com.br',
      ADMIN_WEB_URL: 'https://admin.webag.com.br',
      LOJISTA_WEB_URL: 'https://lojista.webag.com.br',
      BFF_SHARED_SECRET: 'bff-shared-very-long-random-production-secret-5555555',
      CORS_ORIGINS: 'https://app.webag.com.br',
      PAYMENT_PROVIDER: 'mercadopago',
      MP_ACCESS_TOKEN: 'APP_USR-123',
      MP_WEBHOOK_SECRET: 'segredo-do-webhook-123456',
      MP_CLIENT_ID: '1234567890',
      MP_CLIENT_SECRET: 'client-secret-prod',
      MP_OAUTH_REDIRECT_URI: 'https://app.webag.com.br/conectar-mercado-pago',
      PAYMENT_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: 'prod-secret-long',
      GEOCODING_PROVIDER: 'http',
    };

    it('aceita uma configuração de produção completa', () => {
      expect(() => validateEnv(prod)).not.toThrow();
    });

    it('SEC-221: COOKIE_SECURE=true ou ausente sobe em produção; qualquer outro valor só é tolerado fora de produção', () => {
      expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'true' })).not.toThrow();
      expect(() => validateEnv({ ...prod, NODE_ENV: 'development', COOKIE_SECURE: 'false' })).not.toThrow();
    });

    it('SEC-204: em produção o timeout de transação ociosa aceita o padrão, 15000 e 0 (desligado); em desenvolvimento e teste qualquer valor (o e2e usa 1000)', () => {
      for (const value of [undefined, '15000', '60000', '0']) expect(() => validateEnv({ ...prod, ...(value === undefined ? {} : { DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: value }) })).not.toThrow();
      for (const nodeEnv of ['development', 'test']) expect(validateEnv({ ...base, NODE_ENV: nodeEnv, DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '1000' }).DB_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBe(1000);
    });

    it.each([
      ['JWT_ACCESS_SECRET igual ao de desenvolvimento', { JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET }, /JWT_ACCESS_SECRET/],
      ['JWT_ACCESS_SECRET curto', { JWT_ACCESS_SECRET: 'curto' }, /JWT_ACCESS_SECRET/],
      ['AUTH_HMAC_KEY de desenvolvimento', { AUTH_HMAC_KEY: DEV_AUTH_HMAC_KEY }, /AUTH_HMAC_KEY/],
      ['MFA_ENC_KEY de desenvolvimento', { MFA_ENC_KEY: DEV_MFA_ENC_KEY }, /MFA_ENC_KEY/],
      ['CODE_HMAC_KEY de desenvolvimento', { CODE_HMAC_KEY: DEV_CODE_HMAC_KEY }, /CODE_HMAC_KEY/],
      ['RECOVERY_HMAC_KEY de desenvolvimento', { RECOVERY_HMAC_KEY: DEV_RECOVERY_HMAC_KEY }, /RECOVERY_HMAC_KEY/],
      ['COUPON_FRAUD_HMAC_KEY de desenvolvimento (Q10)', { COUPON_FRAUD_HMAC_KEY: DEV_COUPON_FRAUD_HMAC_KEY }, /COUPON_FRAUD_HMAC_KEY/],
      ['COUPON_FRAUD_HMAC_KEY igual à AUTH_HMAC_KEY (Q10)', { COUPON_FRAUD_HMAC_KEY: 'another-very-long-random-production-hmac-key-9876543210' }, /COUPON_FRAUD_HMAC_KEY/],
      ['COUPON_FRAUD_HMAC_KEY curta (Q10)', { COUPON_FRAUD_HMAC_KEY: 'curta' }, /COUPON_FRAUD_HMAC_KEY/],
      ['COUPON_FRAUD_HMAC_KEY_PREVIOUS igual à atual (Q10)', { COUPON_FRAUD_HMAC_KEY_PREVIOUS: 'coupon-fraud-hmac-very-long-random-production-key-77777777' }, /COUPON_FRAUD_HMAC_KEY_PREVIOUS/],
      ['CODE_HMAC_KEY igual à AUTH_HMAC_KEY', { CODE_HMAC_KEY: 'another-very-long-random-production-hmac-key-9876543210' }, /CODE_HMAC_KEY/],
      ['API_PUBLIC_URL sem https (SEC-172)', { API_PUBLIC_URL: 'http://api.webag.com.br' }, /API_PUBLIC_URL/],
      ['WEB_PUBLIC_URL localhost (SEC-172)', { WEB_PUBLIC_URL: 'https://localhost:3001' }, /WEB_PUBLIC_URL/],
      ['ADMIN_WEB_URL esquecida, com o padrão de desenvolvimento (SEC-172)', { ADMIN_WEB_URL: undefined }, /ADMIN_WEB_URL/],
      ['LOJISTA_WEB_URL esquecida, com o padrão de desenvolvimento (A-01)', { LOJISTA_WEB_URL: undefined }, /LOJISTA_WEB_URL/],
      ['LOJISTA_WEB_URL sem https (A-01)', { LOJISTA_WEB_URL: 'http://lojista.webag.com.br' }, /LOJISTA_WEB_URL/],
      ['LOJISTA_WEB_URL localhost (A-01)', { LOJISTA_WEB_URL: 'https://localhost:3001' }, /LOJISTA_WEB_URL/],
      ['TRUST_PROXY ausente (I8)', { TRUST_PROXY: undefined }, /TRUST_PROXY/],
      ['BFF_SHARED_SECRET ausente (SEC-129)', { BFF_SHARED_SECRET: undefined }, /BFF_SHARED_SECRET/],
      ['BFF_SHARED_SECRET igual a outra chave', { BFF_SHARED_SECRET: 'another-very-long-random-production-hmac-key-9876543210' }, /BFF_SHARED_SECRET/],
      ['MFA_ENC_KEY igual à AUTH_HMAC_KEY', { MFA_ENC_KEY: 'another-very-long-random-production-hmac-key-9876543210' }, /MFA_ENC_KEY/],
      ['CORS_ORIGINS vazio', { CORS_ORIGINS: '' }, /CORS_ORIGINS/],
      ['CORS_ORIGINS com *', { CORS_ORIGINS: '*' }, /CORS_ORIGINS/],
      ['/docs ligado', { API_DOCS_ENABLED: 'true' }, /API_DOCS_ENABLED/],
      ['DB_STATEMENT_TIMEOUT_MS=0, consulta sem teto (SEC-203)', { DB_STATEMENT_TIMEOUT_MS: '0' }, /DB_STATEMENT_TIMEOUT_MS/],
      ['DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=5000, abaixo do refresh OAuth (SEC-204)', { DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '5000' }, /DB_IDLE_IN_TRANSACTION_TIMEOUT_MS/],
      ['DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=14999 (SEC-204)', { DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '14999' }, /DB_IDLE_IN_TRANSACTION_TIMEOUT_MS/],
      ['COOKIE_SECURE=false (SEC-221)', { COOKIE_SECURE: 'false' }, /COOKIE_SECURE/],
      ['COOKIE_SECURE=0 (SEC-221)', { COOKIE_SECURE: '0' }, /COOKIE_SECURE/],
      ['COOKIE_SECURE vazio (SEC-221)', { COOKIE_SECURE: '' }, /COOKIE_SECURE/],
      ['COOKIE_SECURE=FALSE (SEC-221)', { COOKIE_SECURE: 'FALSE' }, /COOKIE_SECURE/],
      ['provedor fake', { PAYMENT_PROVIDER: 'fake' }, /PAYMENT_PROVIDER/],
      ['MP sem segredo de webhook', { MP_WEBHOOK_SECRET: undefined }, /MP_WEBHOOK_SECRET/],
      ['credencial de teste do MP', { MP_ACCESS_TOKEN: 'TEST-123' }, /MP_ACCESS_TOKEN/],
      ['chave de cifra ausente', { PAYMENT_TOKEN_ENC_KEY: undefined }, /PAYMENT_TOKEN_ENC_KEY/],
      ['GEOCODER_URL sem https (SEC-169)', { GEOCODER_URL: 'http://geo.interno/search' }, /GEOCODER_URL/],
      ['GEOCODER_URL apontando para o Nominatim público (SEC-169)', { GEOCODER_URL: 'https://nominatim.openstreetmap.org/search' }, /GEOCODER_URL/],
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

    it('SEC-169: GEOCODER_URL vazio = desligado (padrão, nunca o público); URL https própria é aceita; vazio vindo do compose vira "não definido"', () => {
      expect(validateEnv(prod).GEOCODER_URL).toBeUndefined();
      expect(validateEnv({ ...prod, GEOCODER_URL: '', GEOCODER_API_KEY: '' }).GEOCODER_URL).toBeUndefined();
      expect(validateEnv({ ...prod, GEOCODER_URL: '', GEOCODER_API_KEY: '' }).GEOCODER_API_KEY).toBeUndefined();
      expect(validateEnv({ ...prod, GEOCODER_URL: 'https://geocoder.webag.com.br/search', GEOCODER_API_KEY: 'chave-do-provedor-123' }).GEOCODER_URL).toBe('https://geocoder.webag.com.br/search');
      expect(() => validateEnv({ ...prod, GEOCODER_URL: 'https://eu.locationiq.com/v1/search' })).not.toThrow();
    });

    it('APP_ENV=staging (DT-038) aceita fake, TEST- e geocodificador fake; produção explícita continua recusando', () => {
      const relaxed = { ...prod, APP_ENV: 'staging', PAYMENT_PROVIDER: 'fake', GEOCODING_PROVIDER: 'fake' };
      expect(() => validateEnv(relaxed)).not.toThrow();
      expect(() => validateEnv({ ...prod, APP_ENV: 'staging', MP_ACCESS_TOKEN: 'TEST-123' })).not.toThrow();
      for (const appEnv of [undefined, 'production']) {
        expect(() => validateEnv({ ...relaxed, APP_ENV: appEnv })).toThrow(/PAYMENT_PROVIDER/);
        expect(() => validateEnv({ ...prod, APP_ENV: appEnv, MP_ACCESS_TOKEN: 'TEST-123' })).toThrow(/MP_ACCESS_TOKEN/);
      }
    });

    it('staging NÃO afrouxa os segredos: chave de desenvolvimento continua recusada', () => {
      expect(() => validateEnv({ ...prod, APP_ENV: 'staging', JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET })).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('SENTRY_DSN vazio (compose) vale como desligado; DSN inválido derruba o boot', () => {
      expect(validateEnv({ ...prod, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
      expect(() => validateEnv({ ...prod, SENTRY_DSN: 'nao-e-url' })).toThrow(/SENTRY_DSN/);
    });

    it('TRUST_PROXY aceita lista de IP/CIDR e recusa CIDR que confia na internet (SEC-114)', () => {
      expect(validateEnv({ ...prod, TRUST_PROXY: '127.0.0.1,10.0.0.0/8' }).TRUST_PROXY).toEqual(['127.0.0.1', '10.0.0.0/8']);
      expect(() => validateEnv({ ...prod, TRUST_PROXY: '0.0.0.0/0' })).toThrow(/TRUST_PROXY/);
      expect(() => validateEnv({ ...prod, BFF_SHARED_SECRET: 'curto' })).toThrow(/BFF_SHARED_SECRET/);
    });

    it('fora de produção os padrões de desenvolvimento são aceitos', () => {
      expect(() => validateEnv(base)).not.toThrow();
    });
  });
});
