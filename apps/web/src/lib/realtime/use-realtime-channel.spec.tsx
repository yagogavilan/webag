import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeChannel, type RealtimeEvent } from './use-realtime-channel';

type Handler = (...args: unknown[]) => void;
class FakeSocket {
  handlers = new Map<string, Handler>();
  any: ((name: string, payload: unknown) => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  removeAllListeners = vi.fn();
  constructor(
    public url: string,
    public opts: { auth: (cb: (data: { ticket: string }) => void) => void; transports: string[] },
  ) {}
  on(name: string, fn: Handler) {
    this.handlers.set(name, fn);
    return this;
  }
  onAny(fn: (name: string, payload: unknown) => void) {
    this.any = fn;
  }
  fire(name: string, ...args: unknown[]) {
    this.handlers.get(name)?.(...args);
  }
}
const sockets: FakeSocket[] = [];
vi.mock('socket.io-client', () => ({ io: (url: string, opts: FakeSocket['opts']) => (sockets.push(new FakeSocket(url, opts)), sockets.at(-1)) }));

const fetchMock = vi.fn();
const ticket = (n: number) => new Response(JSON.stringify({ ticket: `t${n}`, expiresInSeconds: 60, url: 'https://api.webag.test' }), { status: 200 });
const events: RealtimeEvent[] = [];

function Probe({ enabled = true }: { enabled?: boolean }) {
  const { connected } = useRealtimeChannel({ area: 'lojista', target: { scope: 'store', storeId: 'st-1' }, enabled, onEvent: (e) => events.push(e) });
  return <span data-testid="state">{connected ? 'conectado' : 'polling'}</span>;
}

beforeEach(() => {
  sockets.length = 0;
  events.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const authTicket = (socket: FakeSocket) => new Promise<string>((resolve) => socket.opts.auth((d) => resolve(d.ticket)));

describe('canal em tempo real por ticket (DEC-045)', () => {
  it('pede o ticket ao BFF com o escopo da loja, abre /rt com o ticket (nunca com JWT) e informa conectado', async () => {
    fetchMock.mockResolvedValueOnce(ticket(1));
    render(<Probe />);
    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/proxy/lojista/realtime/tickets');
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ scope: 'store', storeId: 'st-1' });
    const socket = sockets[0]!;
    expect(socket.url).toBe('https://api.webag.test/rt');
    expect(socket.opts.transports).toEqual(['websocket']);
    expect(await authTicket(socket)).toBe('t1');
    expect(screen.getByTestId('state')).toHaveTextContent('polling');
    act(() => socket.fire('connect'));
    expect(screen.getByTestId('state')).toHaveTextContent('conectado');
    act(() => socket.fire('disconnect', 'transport close'));
    expect(screen.getByTestId('state')).toHaveTextContent('polling');
  });

  it('cada reconexão usa um ticket novo (uso único) e o aviso do servidor reabre o canal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValueOnce(ticket(1)).mockResolvedValueOnce(ticket(2));
    render(<Probe />);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const socket = sockets[0]!;
    expect(await authTicket(socket)).toBe('t1');
    expect(await authTicket(socket)).toBe('t2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => socket.fire('disconnect', 'io server disconnect'));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(socket.connect).toHaveBeenCalled();
  });

  it('repassa o aviso (tipo e ids) e ignora auth.expired', async () => {
    fetchMock.mockResolvedValueOnce(ticket(1));
    render(<Probe />);
    await waitFor(() => expect(sockets).toHaveLength(1));
    const socket = sockets[0]!;
    act(() => {
      socket.any?.('order.created', { type: 'order.created', orderId: 'o-1', storeId: 'st-1' });
      socket.any?.('auth.expired', { reason: 'token_expired' });
      socket.any?.('exchange.requested', { exchangeId: 'x-1' });
    });
    expect(events.map((e) => e.type)).toEqual(['order.created', 'exchange.requested']);
    expect(events[0]).toMatchObject({ orderId: 'o-1' });
  });

  it('sem ticket (403, API fora): fica em polling e tenta de novo com recuo, sem abrir socket', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'FORBIDDEN', status: 403, title: 'x' }), { status: 403 })).mockResolvedValueOnce(ticket(2));
    render(<Probe />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sockets).toHaveLength(0);
    expect(screen.getByTestId('state')).toHaveTextContent('polling');
    await act(() => vi.advanceTimersByTimeAsync(5_100));
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
  });

  it('desligado ou desmontado: nada é pedido; ao sair, fecha o socket', async () => {
    const off = render(<Probe enabled={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    off.unmount();
    fetchMock.mockResolvedValueOnce(ticket(1));
    const on = render(<Probe />);
    await waitFor(() => expect(sockets).toHaveLength(1));
    on.unmount();
    expect(sockets[0]!.disconnect).toHaveBeenCalled();
  });
});
