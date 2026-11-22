import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, onSessionLost, sessionRequest } from './client';

const KEYS = ['wb:view-as:last-reason', 'wb:admin:session-reason'];
const note = JSON.stringify({ code: 'other', note: 'texto livre do admin' });

beforeEach(() => KEYS.forEach((key) => window.sessionStorage.setItem(key, note)));
afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

const stored = () => KEYS.map((key) => window.sessionStorage.getItem(key));

describe('SEC-220: motivo digitado não sobrevive à sessão', () => {
  it('o logout apaga as duas chaves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await sessionRequest('admin', 'logout');
    expect(stored()).toEqual([null, null]);
  });

  it('apaga mesmo com o logout falhando (API fora)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(sessionRequest('admin', 'logout')).rejects.toBeDefined();
    expect(stored()).toEqual([null, null]);
  });

  it('o login não apaga (só o logout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ mfaSetupRequired: false })));
    await sessionRequest('admin', 'login', { email: 'a@b.c', password: 'x' });
    expect(stored()).toEqual([note, note]);
  });

  it('401 depois da renovação (sessão perdida) apaga as duas chaves e avisa as telas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 401, code: 'SESSION_IDLE', title: 'x' }, { status: 401, headers: { 'content-type': 'application/problem+json' } })));
    const listener = vi.fn();
    const off = onSessionLost(listener);
    await expect(apiRequest('admin', 'me')).rejects.toBeDefined();
    off();
    expect(listener).toHaveBeenCalledWith('idle');
    expect(stored()).toEqual([null, null]);
  });
});
