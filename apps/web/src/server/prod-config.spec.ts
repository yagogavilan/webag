import { describe, expect, it } from 'vitest';
import { productionConfigProblems } from './prod-config';

const good = { NODE_ENV: 'production', PUBLIC_HOST: 'app.webag.com.br', ADMIN_HOST: 'admin.webag.com.br', LOJISTA_HOST: 'loja.webag.com.br', BFF_SHARED_SECRET: 'x'.repeat(40), PUBLIC_URL: 'https://app.webag.com.br', REALTIME_URL: 'https://api.webag.com.br' };

describe('configuração de produção do web (SEC-172)', () => {
  it('aceita a configuração correta e não reclama fora de produção', () => {
    expect(productionConfigProblems(good)).toEqual([]);
    expect(productionConfigProblems({ NODE_ENV: 'development', PUBLIC_URL: 'http://localhost:3001' })).toEqual([]);
  });

  it('recusa host ausente, localhost, http e segredo ausente, citando só o nome da variável', () => {
    const problems = productionConfigProblems({ NODE_ENV: 'production', PUBLIC_HOST: 'localhost:3001', ADMIN_HOST: '', PUBLIC_URL: 'http://app.webag.com.br', REALTIME_URL: 'https://localhost:3000', PLAY_STORE_URL: 'http://play.google.com/x', NEXT_PUBLIC_API_URL: 'http://localhost:3000' });
    const text = problems.join('\n');
    for (const name of ['PUBLIC_HOST', 'ADMIN_HOST', 'LOJISTA_HOST', 'BFF_SHARED_SECRET', 'PUBLIC_URL', 'REALTIME_URL', 'PLAY_STORE_URL', 'NEXT_PUBLIC_API_URL']) expect(text).toContain(name);
    expect(text).not.toContain('http://');
  });

  it('SEC-221: recusa COOKIE_SECURE diferente de "true" em produção (false, 0, vazio, maiúsculas) e aceita ausente ou "true"', () => {
    for (const value of ['false', 'FALSE', '0', '', ' ', 'no', 'off', 'True', 'true ']) {
      const problems = productionConfigProblems({ ...good, COOKIE_SECURE: value });
      expect(problems.join('\n')).toContain('COOKIE_SECURE');
    }
    expect(productionConfigProblems({ ...good, COOKIE_SECURE: 'true' })).toEqual([]);
    expect(productionConfigProblems(good)).toEqual([]);
    expect(productionConfigProblems({ NODE_ENV: 'development', COOKIE_SECURE: 'false' })).toEqual([]);
  });

  it('SEC-221: o escape de teste local (Playwright) continua valendo para COOKIE_SECURE=false', () => {
    expect(productionConfigProblems({ NODE_ENV: 'production', WEBAG_ALLOW_LOCAL_ORIGINS: 'true', COOKIE_SECURE: 'false' })).toEqual([]);
  });

  it('o escape de teste local só vale com a variável explícita', () => {
    expect(productionConfigProblems({ NODE_ENV: 'production', WEBAG_ALLOW_LOCAL_ORIGINS: 'true' })).toEqual([]);
  });
});
