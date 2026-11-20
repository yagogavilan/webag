// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { clearedCookies, clearedPendingCookie, cookieNames, pendingCookie, sessionCookies } from './cookies';

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

  it('não definem Domain: valem só no host que os gravou (SEC-116)', () => {
    const specs = [...sessionCookies('admin', { accessToken: 'a', refreshToken: 'r', expiresIn: 900 }), ...clearedCookies('lojista'), pendingCookie('mfa', 't')];
    expect(specs.every((c) => !('domain' in c))).toBe(true);
  });

  it('mfaToken e resetTicket: HttpOnly, SameSite=Strict e vida curta (SEC-115)', () => {
    const mfa = pendingCookie('mfa', 'tok', 300);
    expect(mfa).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/', maxAge: 300 });
    expect(pendingCookie('mfa', 'tok', 9999).maxAge).toBe(300);
    expect(pendingCookie('reset', 'tk', 600).maxAge).toBe(600);
    expect(clearedPendingCookie('mfa')).toMatchObject({ value: '', maxAge: 0 });
  });
});
