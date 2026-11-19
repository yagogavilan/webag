import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@/lib/api/store-settings';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { NotificationsPage } from './notifications-page';
import { StoreMenu } from './store-menu';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lojista/loja/avisos' }));

const settings = (over: Partial<StoreSettings> = {}): StoreSettings => ({
  isOpenNow: true,
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, intervals: [{ start: '09:00', end: '18:00' }] })),
  holidays: [],
  pause: { active: false, until: null, indefinitely: false },
  delivery: { acceptsDelivery: true, radiusKm: 5, feeMode: 'fixed', feeFixedCents: 500, tiers: [], minOrderCents: 3000, freeAboveCents: 0, etaMinMinutes: 30, etaMaxMinutes: 45, prepMinutes: 25, prepMinutesIsDefault: false },
  pickup: { enabled: false, useStoreAddress: true, address: null, instructions: null, prepMinMinutes: 15, prepMaxMinutes: 30 },
  exchangePolicy: { voluntaryDays: 7, collectionFeeCents: 0, version: 1, legalFloor: { withdrawalDays: 7, defectDays: 90 } },
  lowStockThreshold: 5,
  notifications: { newOrderEmail: true },
  ...over,
});

function server(current: StoreSettings, role: 'owner' | 'staff' = 'owner') {
  const store = fakeStore({ status: 'approved', step: 4, name: 'Casa Bela', role, payout: { status: 'connected', maskedAccount: 'Titular ***.982.247-**', simulated: true } });
  return mockFetch(
    (url, init) => (init.method === 'PUT' && url.pathname.endsWith('/notifications') ? json({ newOrderEmail: false }) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/settings' ? json(current) : undefined),
    ...storeHandlers(store),
  );
}

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => push.mockClear());

describe('avisos de pedido novo do lojista (B2, WB-192)', () => {
  it('diz, ligado ou desligado, que o alerta e o som do painel não desligam; desligar manda newOrderEmail=false', async () => {
    const { impl, calls } = server(settings());
    vi.stubGlobal('fetch', impl);
    renderLojista(<NotificationsPage />);
    expect(await screen.findByTestId('lojista.avisos.always-on')).toHaveTextContent('O alerta e o som de pedido novo no painel não desligam');
    expect(screen.getByTestId('lojista.avisos.email-what')).toHaveTextContent('Não leva nome, endereço, telefone nem valor');
    expect(screen.queryByTestId('lojista.avisos.off-warning')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.avisos.email-switch'));
    expect(screen.getByTestId('lojista.avisos.off-warning')).toHaveTextContent('só vê o pedido ao abrir o painel');
    expect(screen.getByTestId('lojista.avisos.always-on')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.avisos.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/loja'));
    const put = calls.find((c) => c.url.pathname === '/api/proxy/lojista/stores/s1/notifications');
    expect(put?.init.method).toBe('PUT');
    expect(JSON.parse(String(put?.init.body))).toEqual({ newOrderEmail: false });
  });

  it('API antiga sem o campo vale ligado; já desligado abre desligado e religar manda true', async () => {
    vi.stubGlobal('fetch', server(settings({ notifications: undefined })).impl);
    const a = renderLojista(<NotificationsPage />);
    expect(await screen.findByRole('switch', { name: /E-mail de pedido novo, ligado/ })).toBeInTheDocument();
    a.result.unmount();
    const { impl, calls } = server(settings({ notifications: { newOrderEmail: false } }));
    vi.stubGlobal('fetch', impl);
    renderLojista(<NotificationsPage />);
    const toggle = await screen.findByRole('switch', { name: /E-mail de pedido novo, desligado/ });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByTestId('lojista.avisos.submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/notifications'))?.init.body))).toEqual({ newOrderEmail: true });
  });

  it('falha ao salvar mostra o erro e mantém a escolha; funcionário não tem acesso (só o dono)', async () => {
    vi.stubGlobal('fetch', mockFetch((url, init) => (init.method === 'PUT' && url.pathname.endsWith('/notifications') ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined), (url) => (url.pathname.endsWith('/settings') ? json(settings()) : undefined), ...storeHandlers(fakeStore({ status: 'approved', step: 4, role: 'owner' }))).impl);
    const a = renderLojista(<NotificationsPage />);
    await userEvent.click(await screen.findByTestId('lojista.avisos.email-switch'));
    await userEvent.click(screen.getByTestId('lojista.avisos.submit'));
    expect(await screen.findByTestId('lojista.avisos.error')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    a.result.unmount();
    vi.stubGlobal('fetch', server(settings(), 'staff').impl);
    renderLojista(<NotificationsPage />);
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });

  it('o menu "Minha loja" mostra o estado do e-mail e que o alerta no painel segue ligado', async () => {
    vi.stubGlobal('fetch', server(settings({ notifications: { newOrderEmail: false } })).impl);
    renderLojista(<StoreMenu />);
    const item = await screen.findByTestId('lojista.minha-loja.item-notifications');
    expect(item).toHaveAttribute('href', '/lojista/loja/avisos');
    expect(item).toHaveTextContent('E-mail desligado. Alerta e som no painel sempre ligados');
  });
});
