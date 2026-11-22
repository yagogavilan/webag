import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { consumeSocketToken, WS_MESSAGES_PER_MINUTE } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuthGuard } from './auth.guard.js';

const wsContext = (client: { data?: Record<string, unknown> }): ExecutionContext => ({ getType: () => 'ws', switchToWs: () => ({ getClient: () => client }) }) as unknown as ExecutionContext;

describe('I10: mensagem de WebSocket nasce protegida', () => {
  // As dependências não são usadas no ramo de WebSocket.
  const guard = new AuthGuard(null as never, null as never, null as never, null as never, null as never, null as never);

  it('nega por padrão socket sem identidade do handshake; libera o autenticado', async () => {
    expect(await guard.canActivate(wsContext({ data: {} }))).toBe(false);
    expect(await guard.canActivate(wsContext({}))).toBe(false);
    expect(await guard.canActivate(wsContext({ data: { userId: 'u1' } }))).toBe(true);
  });

  it('balde de fichas: 30 mensagens, a 31ª é recusada, e repõe com o tempo', () => {
    const client = { data: {} as Record<string, unknown> };
    const t0 = 1_000_000;
    for (let i = 0; i < WS_MESSAGES_PER_MINUTE; i += 1) expect(consumeSocketToken(client, t0)).toBe(true);
    expect(() => consumeSocketToken(client, t0)).toThrow();
    expect(consumeSocketToken(client, t0 + 2_100)).toBe(true); // ~1 ficha a cada 2 s
  });
});
