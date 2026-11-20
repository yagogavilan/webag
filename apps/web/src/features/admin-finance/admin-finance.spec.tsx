import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { buildTiers } from './fee-tables-page';
import { RefundQueuePage } from './refund-queue-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/estornos' }));
afterEach(() => vi.unstubAllGlobals());

const item = (over = {}) => ({ id: 'r1', attemptId: 'a1', orderReference: 'abcdef12-0000', amountCents: 8990, reason: 'Pedido recusado', status: 'exhausted', failures: 5, lastErrorCode: 'PROVIDER_DOWN', nextAttemptAt: '2026-11-19T12:00:00Z', coveredAt: null, createdAt: '2026-11-19T10:00:00Z', ...over });

describe('faixas do frete', () => {
  it('valida contiguidade, teto de R$ 50 e troca em branco = metade', () => {
    const ok = buildTiers([{ toKm: '3', fee: '5,00', exchangeFee: '', cost: '4,00', eta: '40' }, { toKm: '6', fee: '8,00', exchangeFee: '3,00', cost: '', eta: '55' }]);
    expect(ok).toEqual({ tiers: [{ fromM: 0, toM: 3000, feeCents: 500, exchangeFeeCents: 250, expectedCostCents: 400, etaMinutes: 40 }, { fromM: 3000, toM: 6000, feeCents: 800, exchangeFeeCents: 300, expectedCostCents: 0, etaMinutes: 55 }] });
    expect(buildTiers([{ toKm: '3', fee: '55,00', exchangeFee: '', cost: '', eta: '40' }])).toEqual({ error: 'Faixa 1: a taxa de entrega vai de R$ 0,00 a R$ 50,00.' });
    expect(buildTiers([{ toKm: '3', fee: '5', exchangeFee: '', cost: '', eta: '40' }, { toKm: '2', fee: '5', exchangeFee: '', cost: '', eta: '40' }])).toMatchObject({ error: expect.stringContaining('Faixa 2') });
    expect(buildTiers([])).toEqual({ error: 'Adicione ao menos uma faixa.' });
  });
});

describe('fila de estornos pendentes', () => {
  it('super admin cobre estorno esgotado com motivo; o financeiro não vê "Cobrir"', async () => {
    const covered: unknown[] = [];
    const server = () =>
      mockFetch((url, init) => {
        const p = url.pathname.replace('/api/proxy/admin/', '');
        if (p === 'admin/payments/refund-queue') return json({ data: [item()], nextCursor: null });
        if (p === 'admin/payments/refund-queue/r1/cover' && init.method === 'POST') {
          covered.push(JSON.parse(String(init.body)));
          return json(null, 204);
        }
        return undefined;
      }).impl;
    vi.stubGlobal('fetch', server());
    const user = userEvent.setup();
    const view = renderPanel(<RefundQueuePage />, 'super_admin');
    await user.click(await screen.findByTestId('admin.estornos.cover-r1'));
    await user.type(await screen.findByTestId('admin.estornos.cover-reason'), 'Provedor fora do ar há horas');
    await user.click(screen.getByTestId('admin.estornos.cover-confirm'));
    await waitFor(() => expect(covered).toEqual([{ reason: 'Provedor fora do ar há horas' }]));
    view.unmount();

    vi.stubGlobal('fetch', server());
    renderPanel(<RefundQueuePage />, 'finance');
    expect(await screen.findByTestId('admin.estornos.retry-r1')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.estornos.cover-r1')).not.toBeInTheDocument();
    expect(screen.getByText(/Peça a um super admin/)).toBeInTheDocument();
  });

  it('operação não tem acesso aos estornos', () => {
    vi.stubGlobal('fetch', mockFetch().impl);
    renderPanel(<RefundQueuePage />, 'operations');
    expect(screen.getByTestId('no-access')).toBeInTheDocument();
  });
});
