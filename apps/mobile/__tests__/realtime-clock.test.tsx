import { act, render, renderHook, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { io } from 'socket.io-client';
import { sessionStore } from '../src/api/session';
import { useSecondsUntil } from '../src/features/pix/useSecondsUntil';
import { realtimeDebug, useRealtime } from '../src/features/realtime/useRealtime';
import { observeServerDate, resetServerClock, serverNow } from '../src/lib/server-clock';

describe('I11: vencimento pelo relógio do SERVIDOR', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetServerClock();
  });
  afterEach(() => jest.useRealTimers());

  it('aparelho 1 h adiantado: o PIX não "vence" antes da hora do servidor', async () => {
    jest.setSystemTime(new Date('2026-11-19T14:00:00Z'));
    const deviceNow = Date.now() + 3_600_000; // o aparelho acha que é 15:00
    jest.setSystemTime(deviceNow);
    // a resposta do servidor diz que são 14:00:00 (cabeçalho Date)
    observeServerDate('Thu, 19 Nov 2026 14:00:00 GMT', deviceNow - 100, deviceNow + 100);
    expect(Math.abs(serverNow() - Date.parse('2026-11-19T14:00:00.500Z'))).toBeLessThan(1_000);

    // PIX vence às 14:10 (servidor): faltam ~10 min, e não "0" como o relógio do aparelho diria
    const { result } = await renderHook(() => useSecondsUntil('2026-11-19T14:10:00Z'));
    expect(result.current).toBeGreaterThan(590);
    expect(result.current).toBeLessThanOrEqual(600);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBeLessThanOrEqual(540);
  });

  it('sem resposta ainda, usa o relógio do aparelho; cabeçalho inválido não quebra', () => {
    observeServerDate('lixo', 0, 10);
    observeServerDate(null, 0, 10);
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(5);
  });
});

function Probe({ id, label }: { id?: string; label: string }) {
  const { connected } = useRealtime({ orderId: id, onEvent: () => undefined });
  return <Text>{`${label}:${connected ? 'on' : 'off'}`}</Text>;
}

describe('I11: um único socket compartilhado', () => {
  beforeEach(async () => {
    realtimeDebug.reset();
    (io as jest.Mock).mockClear();
    await sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });
  });
  afterEach(() => realtimeDebug.reset());

  it('três telas montadas abrem UMA conexão', async () => {
    await act(async () => {
      render(
        <>
          <Probe label="lista" />
          <Probe id="o1" label="pedido" />
          <Probe id="o2" label="troca" />
        </>,
      );
    });
    expect(io).toHaveBeenCalledTimes(1);
    expect(realtimeDebug.subscriberCount()).toBe(3);
    expect(screen.getByText('lista:off')).toBeOnTheScreen();
  });

  it('sair da sessão derruba o socket na hora', async () => {
    await act(async () => {
      render(<Probe label="lista" />);
    });
    expect(realtimeDebug.hasSocket()).toBe(true);
    await act(async () => {
      await sessionStore.clear();
    });
    expect(realtimeDebug.hasSocket()).toBe(false);
  });
});
