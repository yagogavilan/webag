import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deadlineTone, formatDeadline, type Exchange } from '@/lib/api/exchanges';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ExchangesPage } from './exchanges-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/trocas' }));

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const exchange = (over: Partial<Exchange> = {}): Exchange =>
  ({
    id: 'x1',
    number: 'TR-1042',
    orderId: 'o1',
    orderNumber: 'WB-4K7P2',
    status: 'requested',
    type: 'size_color',
    method: 'pickup_at_home',
    resolution: 'replace',
    quantity: 1,
    item: { orderItemId: 'i1', name: 'Camiseta Básica', attributes: { Tam: 'M' } },
    newVariant: { variantId: 'v2', attributes: { Tam: 'G' } },
    fee: money(500),
    difference: money(0),
    totalDue: money(500),
    refund: money(0),
    answerDeadlineAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    windowEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  }) as Exchange;

afterEach(() => vi.unstubAllGlobals());

describe('prazo de resposta (SLA de 24 h)', () => {
  it('muda de nível em 8 h e 2 h e sempre diz o tempo em texto', () => {
    expect(deadlineTone(20 * 3_600_000)).toBe('normal');
    expect(deadlineTone(7 * 3_600_000)).toBe('warning');
    expect(deadlineTone(90 * 60_000)).toBe('urgent');
    expect(deadlineTone(-1)).toBe('late');
    expect(formatDeadline(20 * 3_600_000)).toBe('Responda em 20 h');
    expect(formatDeadline(30 * 60_000)).toBe('Responda em 30 min');
  });
});

describe('trocas do lojista (aprovar troca)', () => {
  it('aprova com 1 toque, sem diálogo de confirmação', async () => {
    const calls: string[] = [];
    let pending = [exchange()];
    vi.stubGlobal(
      'fetch',
      mockFetch(
        (url, init) => {
          if (url.pathname.endsWith('/stores/s1/exchanges') && url.searchParams.get('scope') === 'pending') return json({ data: pending, nextCursor: null });
          if (url.pathname.endsWith('/exchanges/x1/accept') && init.method === 'POST') {
            calls.push('accept');
            pending = [];
            return json(exchange({ status: 'approved' }));
          }
          return undefined;
        },
        ...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, name: 'Casa Bela' })),
      ).impl,
    );
    const user = userEvent.setup();
    renderLojista(<ExchangesPage />);
    expect(await screen.findByTestId('lojista.trocas.deadline-x1')).toHaveTextContent('Responda em 20 h');
    expect(screen.getByText(/Webag busca em casa/)).toBeInTheDocument();
    await user.click(screen.getByTestId('lojista.trocas.approve-x1'));
    await waitFor(() => expect(calls).toEqual(['accept']));
    expect(await screen.findByTestId('lojista.trocas.empty')).toBeInTheDocument();
  });

  it('desistência por lei não tem "Recusar"; tamanho/cor recusa com motivo', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        (url) => (url.pathname.endsWith('/stores/s1/exchanges') ? json({ data: [exchange({ id: 'x2', type: 'withdrawal' }), exchange({ id: 'x3' })], nextCursor: null }) : undefined),
        ...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, name: 'Casa Bela' })),
      ).impl,
    );
    renderLojista(<ExchangesPage />);
    expect(await screen.findByTestId('lojista.trocas.accept-regret-x2')).toHaveTextContent('Aceitar desistência');
    expect(screen.queryByTestId('lojista.trocas.reject-x2')).not.toBeInTheDocument();
    expect(screen.getByTestId('lojista.trocas.reject-x3')).toBeInTheDocument();
  });
});
