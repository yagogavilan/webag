// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { areaAllowedOnHost, requestHost } from './hosts';

afterEach(() => vi.unstubAllEnvs());
const host = (value: string, extra: Record<string, string> = {}) => new Headers({ host: value, ...extra });

describe('separação de hosts (SEC-116)', () => {
  it('cada área só responde no seu host', () => {
    vi.stubEnv('ADMIN_HOST', 'admin.webag.com.br');
    vi.stubEnv('LOJISTA_HOST', 'lojista.webag.com.br');
    expect(areaAllowedOnHost('admin', host('admin.webag.com.br'))).toBe(true);
    expect(areaAllowedOnHost('lojista', host('admin.webag.com.br'))).toBe(false);
    expect(areaAllowedOnHost('lojista', host('Lojista.Webag.com.br'))).toBe(true);
    expect(areaAllowedOnHost('admin', host('lojista.webag.com.br'))).toBe(false);
  });

  it('em dev, sem variáveis, qualquer host serve (localhost)', () => {
    expect(areaAllowedOnHost('admin', host('localhost:3001'))).toBe(true);
    expect(areaAllowedOnHost('lojista', host('localhost:3001'))).toBe(true);
  });

  it('X-Forwarded-Host só vale quando o proxy é declarado confiável', () => {
    const headers = host('interno:3001', { 'x-forwarded-host': 'admin.webag.com.br' });
    expect(requestHost(headers)).toBe('interno:3001');
    vi.stubEnv('WEB_TRUST_FORWARDED_HOST', 'true');
    expect(requestHost(headers)).toBe('admin.webag.com.br');
  });
});
