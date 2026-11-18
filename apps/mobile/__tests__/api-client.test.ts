import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureApiClient, getMe } from '@webag/shared';
import * as SecureStore from 'expo-secure-store';
import { signIn } from '../src/api/auth-api';
import { ApiError } from '../src/api/problem';
import { request } from '../src/api/http';
import { sessionStore } from '../src/api/session';
import type { StoredSession } from '../src/api/session-storage';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const ME = { id: 'u1', email: 'maria@gmail.com', emailVerified: true, name: 'Maria', phone: null, roles: ['customer'], adminProfile: null, pendingTerms: [] };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const session = (overrides: Partial<StoredSession> = {}): StoredSession => ({
  accessToken: 'access-1',
  refreshToken: 'refresh-1-'.padEnd(40, 'x'),
  accessExpiresAt: Date.now() + 15 * 60_000,
  user: { id: 'u1', name: 'Maria', email: 'maria@gmail.com', emailVerified: true },
  ...overrides,
});

let fetchMock: jest.Mock;

beforeEach(async () => {
  configureApiClient({ baseUrl: 'https://api.test' });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  store.clear();
  await AsyncStorage.clear();
  await sessionStore.clear();
});

const callOf = (n: number) => fetchMock.mock.calls[n] as [string, RequestInit];
const headerOf = (n: number, name: string) => new Headers(callOf(n)[1].headers).get(name);

describe('cliente de API', () => {
  it('anexa Bearer e o id do aparelho e devolve só o corpo de sucesso', async () => {
    await sessionStore.setSession(session());
    fetchMock.mockResolvedValueOnce(json(200, ME));
    const me = await request((init) => getMe(init));
    expect(me.email).toBe('maria@gmail.com');
    expect(callOf(0)[0]).toBe('https://api.test/v1/me');
    expect(headerOf(0, 'authorization')).toBe('Bearer access-1');
    expect(headerOf(0, 'x-device-id')).toBeTruthy();
  });

  it('401 renova o par (refresh rotativo), repete a chamada uma vez e persiste os tokens novos no SecureStore', async () => {
    await sessionStore.setSession(session());
    fetchMock
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHENTICATED', status: 401 }))
      .mockResolvedValueOnce(json(200, { accessToken: 'access-2', refreshToken: 'refresh-2-'.padEnd(40, 'y'), expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(json(200, ME));

    await request((init) => getMe(init));

    expect(callOf(1)[0]).toBe('https://api.test/v1/auth/refresh');
    expect(JSON.parse(String(callOf(1)[1].body))).toEqual({ refreshToken: 'refresh-1-'.padEnd(40, 'x') });
    expect(headerOf(2, 'authorization')).toBe('Bearer access-2');
    expect(sessionStore.getTokens()?.refreshToken).toBe('refresh-2-'.padEnd(40, 'y'));
    expect(store.get('webag.session.v1')).toContain('access-2');
  });

  it('várias chamadas com 401 ao mesmo tempo disparam UMA renovação (reuso derrubaria a sessão)', async () => {
    await sessionStore.setSession(session({ accessExpiresAt: Date.now() - 1000 }));
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls += 1;
        return json(200, { accessToken: 'access-2', refreshToken: 'refresh-2-'.padEnd(40, 'y'), expiresIn: 900, tokenType: 'Bearer' });
      }
      return json(200, ME);
    });
    await Promise.all([request((i) => getMe(i)), request((i) => getMe(i)), request((i) => getMe(i))]);
    expect(refreshCalls).toBe(1);
  });

  it('REFRESH_REUSED encerra a sessão no aparelho e marca o aviso de segurança', async () => {
    await sessionStore.setSession(session({ accessExpiresAt: Date.now() - 1000 }));
    fetchMock.mockResolvedValueOnce(json(401, { code: 'REFRESH_REUSED', status: 401 }));
    await request((init) => getMe(init)).catch(() => undefined);
    expect(sessionStore.getState()).toEqual({ status: 'anonymous', notice: 'reused' });
    expect(store.has('webag.session.v1')).toBe(false);
  });

  it('falha de rede na renovação NÃO derruba a sessão', async () => {
    await sessionStore.setSession(session({ accessExpiresAt: Date.now() - 1000 }));
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(request((init) => getMe(init))).rejects.toMatchObject({ kind: 'network' });
    expect(sessionStore.getState().status).toBe('authenticated');
  });

  it('erro RFC 9457 vira ApiError com code estável, campos e Retry-After', async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, { type: 'x', title: 'Muitas tentativas', status: 429, code: 'RATE_LIMITED', detail: 'Tente depois' }, { 'retry-after': '120' }),
    );
    const error = await request((init) => getMe(init), { auth: 'none' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 120, detail: 'Tente depois' });
  });

  it('leitura com retry repete falha de rede e 5xx com backoff e acaba tendo sucesso', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(json(503, { code: 'UNAVAILABLE', status: 503 }))
      .mockResolvedValueOnce(json(200, ME));
    const pending = request((init) => getMe(init), { auth: 'none', retry: true });
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ id: 'u1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('escrita sem Idempotency-Key NÃO é repetida sozinha; com a chave, é, e a chave é a mesma', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(request((init) => getMe(init), { auth: 'none' })).rejects.toMatchObject({ kind: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(json(200, ME));
    const pending = request((init) => getMe(init), { auth: 'none', idempotencyKey: 'abc-123' });
    await jest.runAllTimersAsync();
    await pending;
    expect(headerOf(0, 'idempotency-key')).toBe('abc-123');
    expect(headerOf(1, 'idempotency-key')).toBe('abc-123');
    jest.useRealTimers();
  });

  it('resposta que não é JSON (página de erro do proxy) vira erro de servidor, sem vazar o corpo', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
    await expect(request((init) => getMe(init), { auth: 'none' })).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('sessão: armazenamento seguro (SEC-012, MASVS-STORAGE)', () => {
  it('tokens ficam só no SecureStore; nada no AsyncStorage', async () => {
    await sessionStore.setSession(session());
    expect(store.get('webag.session.v1')).toContain('refresh-1-');
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('sair apaga a sessão do aparelho', async () => {
    await sessionStore.setSession(session());
    await sessionStore.clear();
    expect(store.has('webag.session.v1')).toBe(false);
    expect(sessionStore.getState()).toEqual({ status: 'anonymous' });
  });

  it('bootstrap restaura a sessão sem chamar a rede e ignora conteúdo corrompido', async () => {
    store.set('webag.session.v1', JSON.stringify(session()));
    await sessionStore.bootstrap();
    expect(sessionStore.getState().status).toBe('authenticated');
    expect(fetchMock).not.toHaveBeenCalled();

    store.set('webag.session.v1', '{lixo');
    await sessionStore.bootstrap();
    expect(sessionStore.getState().status).toBe('anonymous');
  });
});

describe('login do cliente (1 passo)', () => {
  it('conta de admin (resposta MfaChallenge) é tratada como credencial errada no app', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { mfaRequired: true, mfaToken: 'x'.repeat(30), expiresIn: 300 }));
    await expect(signIn({ email: 'admin@webag.test', password: 'qualquer123' })).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(sessionStore.getState().status).toBe('anonymous');
  });

  it('SEC-121: admin sem TOTP (mfaSetupRequired) não fica com sessão: logout no servidor e credencial errada', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(200, {
          user: { id: 'a1', email: 'admin@webag.test', emailVerified: true, name: 'Admin' },
          tokens: { accessToken: 'acc', refreshToken: 'ref-'.padEnd(40, 'z'), expiresIn: 900, tokenType: 'Bearer' },
          mfaSetupRequired: true,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(signIn({ email: 'admin@webag.test', password: 'qualquer123' })).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(String(callOf(1)[0])).toContain('/v1/auth/logout');
    expect(sessionStore.getState().status).toBe('anonymous');
    expect(store.get('webag.session.v1')).toBeUndefined();
  });

  it('entra e guarda a sessão no SecureStore', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        user: { id: 'u1', email: 'maria@gmail.com', emailVerified: false, name: 'Maria' },
        tokens: { accessToken: 'acc', refreshToken: 'ref-'.padEnd(40, 'z'), expiresIn: 900, tokenType: 'Bearer' },
        mfaSetupRequired: false,
      }),
    );
    await signIn({ email: ' Maria@Gmail.com ', password: 'Cachorro2024' });
    expect(JSON.parse(String(callOf(0)[1].body))).toEqual({ email: 'maria@gmail.com', password: 'Cachorro2024' });
    expect(sessionStore.getState()).toMatchObject({ status: 'authenticated', user: { emailVerified: false } });
    expect(store.get('webag.session.v1')).toContain('ref-');
  });
});
