import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { periodOf } from '@/lib/api/finance';
import { canSeeSalesValues } from '@/lib/lojista-access';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { FinancePage } from './finance-page';
import { chartSummary, dayLabel } from './sales-chart';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/financeiro' }));

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
afterEach(() => vi.unstubAllGlobals());

describe('financeiro do lojista', () => {
  it('períodos em dias de Brasília, inclusivos', () => {
    const now = new Date('2026-11-19T15:00:00Z');
    expect(periodOf('today', now)).toEqual({ from: '2026-11-19', to: '2026-11-19' });
    expect(periodOf('7d', now)).toEqual({ from: '2026-11-13', to: '2026-11-19' });
    expect(periodOf('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-19' });
  });

  it('valores de venda só para o dono ou com a permissão `sales_values`', () => {
    expect(canSeeSalesValues(fakeStore({ role: 'owner' }))).toBe(true);
    expect(canSeeSalesValues(fakeStore({ role: 'staff', permissions: ['orders'] }))).toBe(false);
    expect(canSeeSalesValues(fakeStore({ role: 'staff', permissions: ['orders', 'sales_values'] }))).toBe(true);
  });

  it('o resumo mostra vendas, comissão e líquido; o funcionário vê "sem acesso"', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        (url) =>
          url.pathname.endsWith('/finance/summary')
            ? json({ period: { from: '2026-10-21', to: '2026-11-19' }, sales: { period: {}, orders: 12, gross: money(124000), averageTicket: money(10333) }, commission: { charged: money(18600), returned: money(0), net: money(18600) }, providerFees: money(4900), refunds: money(0), net: money(100500), receivable: { informational: true, graceDays: 7, pending: { orders: 1, amount: money(9000) }, inGrace: { orders: 2, amount: money(20000) }, released: { orders: 9, amount: money(71500) } } })
            : undefined,
        ...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, name: 'Casa Bela' })),
      ).impl,
    );
    renderLojista(<FinancePage />);
    expect(await screen.findByTestId('lojista.financeiro.kpi-net')).toHaveTextContent('1.005,00');
    expect(screen.getByTestId('lojista.financeiro.kpi-commission')).toHaveTextContent('186,00');
  });

  it('funcionário não vê o financeiro', async () => {
    vi.stubGlobal('fetch', mockFetch(...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, role: 'staff', name: 'Casa Bela' }))).impl);
    renderLojista(<FinancePage />);
    expect(await screen.findByText(/não tem acesso|sem acesso/i)).toBeInTheDocument();
  });
});

describe('gráfico de vendas por dia (WB-198)', () => {
  const summary = { period: { from: '2026-10-21', to: '2026-11-19' }, sales: { period: {}, orders: 3, gross: money(30000), averageTicket: money(10000) }, commission: { charged: money(3000), returned: money(0), net: money(3000) }, providerFees: money(0), refunds: money(0), net: money(27000), receivable: { informational: true, graceDays: 7, pending: { orders: 0, amount: money(0) }, inGrace: { orders: 0, amount: money(0) }, released: { orders: 3, amount: money(27000) } } };
  const daily = { period: { from: '2026-11-17', to: '2026-11-19' }, timezone: 'America/Sao_Paulo', data: [{ date: '2026-11-17', orders: 2, gross: money(20000) }, { date: '2026-11-18', orders: 0, gross: money(0) }, { date: '2026-11-19', orders: 1, gross: money(10000) }] };

  it('resumo em texto: total, melhor dia e dias sem venda', () => {
    expect(dayLabel('2026-11-19')).toBe('19/11');
    expect(chartSummary(daily.data as never).replace(/\u00a0/g, ' ')).toBe('3 pedidos, R$ 300,00 no período. Melhor dia: 17/11, R$ 200,00. 1 dia sem venda.');
    expect(chartSummary([{ date: '2026-11-17', orders: 0, gross: money(0) }] as never)).toBe('Nenhuma venda no período.');
  });

  it('mostra o gráfico e a tabela equivalente', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/finance/sales/daily') ? json(daily) : url.pathname.endsWith('/finance/summary') ? json(summary) : undefined), ...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, name: 'Casa Bela' }))).impl);
    renderLojista(<FinancePage />);
    expect(await screen.findByTestId('lojista.financeiro.chart')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Gráfico de vendas por dia.*Melhor dia: 17\/11/ })).toBeInTheDocument();
    expect(screen.getByTestId('lojista.financeiro.bar-2026-11-18')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.financeiro.chart-toggle'));
    const table = screen.getByTestId('lojista.financeiro.chart-table');
    expect(table).toHaveTextContent('17/11');
    expect(table).toHaveTextContent('R$ 200,00');
  });

  it('falha só o gráfico: o resto do resumo continua e há ação de tentar de novo', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/finance/sales/daily') ? json({ code: 'X', title: 'x', status: 500 }, 500) : url.pathname.endsWith('/finance/summary') ? json(summary) : undefined), ...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, name: 'Casa Bela' }))).impl);
    renderLojista(<FinancePage />);
    expect(await screen.findByTestId('lojista.financeiro.chart-error')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.financeiro.kpi-net')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
