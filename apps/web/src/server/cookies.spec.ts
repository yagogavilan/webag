// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { clearedCookies, cookieNames, sessionCookies } from './cookies';

describe('cookies de sessão', () => {
  it('são HttpOnly, SameSite=Lax e separados por área (SEC-106)', () => {
    const admin = sessionCookies('admin', { accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    expect(admin.every((c) => c.httpOnly && c.sameSite === 'lax' && c.path === '/')).toBe(true);
    expect(cookieNames('admin').access).not.toBe(cookieNames('lojista').access);
    expect(cookieNames('admin').refresh).not.toBe(cookieNames('lojista').refresh);
  });

  it('o access expira antes do token da API e o refresh dura 30 dias', () => {
    const [access, refresh] = sessionCookies('admin', { accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    expect(access?.maxAge).toBeLessThan(900);
    expect(refresh?.maxAge).toBe(60 * 60 * 24 * 30);
  });

  it('logout zera os dois', () => {
    expect(clearedCookies('admin').map((c) => [c.value, c.maxAge])).toEqual([['', 0], ['', 0]]);
  });
});
