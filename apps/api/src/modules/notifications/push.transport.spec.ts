import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../platform/config/env.js';
import { PushTransport } from './push.transport.js';

const config = (mode: 'log' | 'expo', token?: string) => ({ get: (key: string) => (key === 'PUSH_PROVIDER' ? mode : token) }) as unknown as ConfigService<Env, true>;
const msg = (n: number) => ({ to: `ExponentPushToken[token-${n}-xxxxxxxx]`, title: 'T', body: 'B', data: { type: 'order' } });

describe('PushTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('modo log: guarda em memória e nunca chama a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const transport = new PushTransport(config('log'));
    expect(await transport.send([msg(1)])).toEqual([{ ok: true, invalidToken: false }]);
    expect(transport.sent).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('modo expo: envia em lotes de 100, marca DeviceNotRegistered como token inválido e usa o token de acesso', async () => {
    const calls: { headers: Record<string, string>; body: unknown[] }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: { headers: Record<string, string>; body: string }) => {
        const body = JSON.parse(init.body) as unknown[];
        calls.push({ headers: init.headers, body });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: body.map((_, i) => (i === 1 ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }) });
      }),
    );
    const transport = new PushTransport(config('expo', 'secret-token'));
    const results = await transport.send(Array.from({ length: 150 }, (_, i) => msg(i)));
    expect(calls.map((c) => c.body.length)).toEqual([100, 50]);
    expect(calls[0]!.headers.Authorization).toBe('Bearer secret-token');
    expect(results[1]).toEqual({ ok: false, invalidToken: true });
    expect(results[0]).toEqual({ ok: true, invalidToken: false });
    expect(transport.sent).toHaveLength(0);
  });

  it('falha de rede ou resposta de erro não lança: devolve não enviado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const transport = new PushTransport(config('expo'));
    expect(await transport.send([msg(1)])).toEqual([{ ok: false, invalidToken: false }]);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    expect(await transport.send([msg(1)])).toEqual([{ ok: false, invalidToken: false }]);
  });
});
