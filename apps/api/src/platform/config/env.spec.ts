import { validateEnv } from './env.js';

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
});
