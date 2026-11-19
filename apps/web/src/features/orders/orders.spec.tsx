import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreOrderSummary } from '@/lib/api/orders';
import type { AlertSound } from '@/lib/orders/alert-sound';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { OrderAlertHost } from './order-alert';
import { OrdersPage } from './orders-page';
import { OrdersRuntimeProvider } from './orders-runtime';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/pedidos' }));

const store = fakeStore({ id: 's1', status: 'live', step: 4, name: 'Casa Bela' });
const summary = (over: Partial<StoreOrderSummary> = {}): StoreOrderSummary => ({
  id: 'o1',
  number: 'WB-4K7P2',
  status: 'received',
  mode: 'delivery',
  createdAt: new Date().toISOString(),
  paidAt: new Date().toISOString(),
  acceptDeadlineAt: new Date(Date.now() + 9 * 60_000).toISOString(),
  customerFirstName: 'Carla',
  itemCount: 2,
  firstItemName: 'Camiseta Básica',
  total: { amount: 8990, currency: 'BRL' },
  allowedActions: ['accept', 'refuse'],
  ...over,
});

function fakeSound(): AlertSound & { plays: string[] } {
  let on = false;
  const listeners = new Set<() => void>();
  const plays: string[] = [];
  return {
    supported: true,
    plays,
    isEnabled: () => on,
    enable: async () => {
      on = true;
      listeners.forEach((l) => l());
      return true;
    },
    play: (level) => void plays.push(level),
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** Servidor falso: o pedido novo some da lista "new" depois que a loja aceita. */
function server(orders: { new: StoreOrderSummary[]; progress: StoreOrderSummary[] }) {
  const state = { ...orders };
  return mockFetch(
    (url, init) => {
      if (url.pathname.endsWith('/stores/s1/orders') && (url.searchParams.get('scope') === 'new')) return json({ data: state.new, nextCursor: null });
      if (url.pathname.endsWith('/stores/s1/orders') && url.searchParams.get('scope') === 'in_progress') return json({ data: state.progress, nextCursor: null });
      const accept = url.pathname.match(/\/stores\/s1\/orders\/(o\d)\/accept$/);
      if (accept && init.method === 'POST') {
        const order = state.new.find((o) => o.id === accept[1]);
        state.new = state.new.filter((o) => o.id !== accept[1]);
        if (order) state.progress = [...state.progress, { ...order, status: 'accepted', allowedActions: ['prepare', 'cancel'] }];
        return json({ id: accept[1], number: order?.number, status: 'accepted', timeline: [], items: [], allowedActions: [] });
      }
      if (/\/stores\/s1\/orders\/o\d$/.test(url.pathname)) return json({ id: 'o1', number: 'WB-4K7P2', status: 'received', items: [{ name: 'Camiseta Básica', attributes: { Tam: 'M' }, quantity: 2, image: {}, unitPrice: null, lineTotal: null }], timeline: [], allowedActions: ['accept', 'refuse'], customer: { firstName: 'Carla', phone: null } });
      return undefined;
    },
    ...storeHandlers(store),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('painel de pedidos do lojista (receber e aceitar)', () => {
  it('pedido novo abre o alerta, toca o som e o aceite leva o pedido a "Em separação"', async () => {
    const sound = fakeSound();
    const { impl, calls } = server({ new: [summary()], progress: [] });
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(
      <OrdersRuntimeProvider createSound={() => sound}>
        <OrderAlertHost />
        <OrdersPage />
      </OrdersRuntimeProvider>,
    );

    const modal = await screen.findByTestId('lojista.alert.modal');
    expect(modal).toHaveAttribute('role', 'alertdialog');
    expect(screen.getByTestId('lojista.alert.timer')).toHaveTextContent(/Responda em \d:\d\d/);

    // O som só toca depois do toque do lojista em "Ligar som" (política do navegador).
    await user.click(await screen.findByTestId('lojista.alert.sound-enable'));
    await waitFor(() => expect(sound.plays.length).toBeGreaterThan(0));

    await user.click(screen.getByTestId('lojista.alert.accept'));
    await waitFor(() => expect(calls.some((call) => call.url.pathname.endsWith('/orders/o1/accept') && call.init.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('lojista.alert.modal')).not.toBeInTheDocument());
    expect(await screen.findByTestId('lojista.orders.card-o1-next')).toHaveTextContent('Iniciar separação');
  });

  it('sem pedidos: vazio com som de teste; sem conexão com a API: erro com tentar de novo', async () => {
    vi.stubGlobal('fetch', server({ new: [], progress: [] }).impl);
    renderLojista(
      <OrdersRuntimeProvider createSound={fakeSound}>
        <OrdersPage />
      </OrdersRuntimeProvider>,
    );
    expect(await screen.findByTestId('lojista.orders.empty')).toHaveTextContent('Nenhum pedido agora');
  });

  it('pedido de entrega pronto não mostra "saiu" nem "entregue" para a loja', async () => {
    const ready = summary({ id: 'o2', number: 'WB-9X9X9', status: 'ready_for_collection', allowedActions: ['prepare', 'cancel'] });
    vi.stubGlobal('fetch', server({ new: [], progress: [ready] }).impl);
    const user = userEvent.setup();
    renderLojista(
      <OrdersRuntimeProvider createSound={fakeSound}>
        <OrdersPage />
      </OrdersRuntimeProvider>,
    );
    await user.click(await screen.findByTestId('lojista.orders.tab-ready'));
    expect(await screen.findByText('Pronto para coleta')).toBeInTheDocument();
    expect(screen.queryByText(/saiu para entrega|marcar como entregue/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('lojista.orders.card-o2-next')).not.toBeInTheDocument();
  });
});
