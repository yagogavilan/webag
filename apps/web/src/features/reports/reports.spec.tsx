import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { OrdersChart, ReportsPage } from './reports-page';

afterEach(() => vi.unstubAllGlobals());
const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const report = (over: object = {}) => ({
  period: { from: '2026-10-20', to: '2026-11-18' },
  timezone: 'America/Sao_Paulo',
  empty: false,
  kpis: { orders: 1240, gmv: money(4820000), gmvDelivered: money(4100000), deliveredOrders: 1000, averageTicket: money(4100), newStores: 6, newCustomers: 312, repurchase: { cohort: 200, repurchased: 54, ratePct: 27 }, cancelledOrders: 40, cancellationRatePct: 3.2 },
  variation: { ordersPct: 12, gmvPct: -4, gmvDeliveredPct: null, averageTicketPct: 0, newStoresPct: null, newCustomersPct: 8 },
  revenue: { orders: { commission: money(300000), serviceFee: money(50000), deliveryFee: money(80000) }, ledger: {} },
  series: [{ date: '2026-11-17', orders: 30, gmv: money(120000) }, { date: '2026-11-18', orders: 50, gmv: money(200000) }],
  cancellations: [{ actor: 'store', reason: 'Sem estoque', orders: 12, value: money(90000) }],
  ...over,
});
const page = (data: object[]) => ({ data, nextCursor: null });
const base = (extra?: (url: URL, init: RequestInit) => Response | undefined) =>
  mockFetch(
    (url, init) => extra?.(url, init),
    (url) => (url.pathname.endsWith('/admin/regions/cities') ? json(page([])) : undefined),
    (url) => (url.pathname.endsWith('/admin/categories') ? json({ data: [], nextCursor: null, icons: [] }) : undefined),
    (url) => (url.pathname.endsWith('/admin/stores') ? json(page([])) : undefined),
    (url) => (url.pathname.endsWith('/reports/operations') ? json(report()) : undefined),
  );

describe('ReportsPage (RL1)', () => {
  it('mostra os indicadores com variação em texto e a definição ao tocar em Info', async () => {
    vi.stubGlobal('fetch', base().impl);
    renderPanel(<ReportsPage />);
    expect(await screen.findByTestId('admin.relatorios.kpi-orders')).toHaveTextContent('1240');
    expect(screen.getByTestId('admin.relatorios.kpi-orders')).toHaveTextContent('+12% vs. período anterior');
    expect(screen.getByTestId('admin.relatorios.kpi-gmv')).toHaveTextContent('-4% vs. período anterior');
    expect(screen.getByTestId('admin.relatorios.kpi-gmv-done')).toHaveTextContent('sem comparação');
    expect(screen.getByTestId('admin.relatorios.kpi-repurchase')).toHaveTextContent('27,0%');
    await userEvent.click(screen.getByTestId('admin.relatorios.kpi-gmv-info'));
    expect(screen.getByText(/Total dos pedidos não cancelados/)).toBeInTheDocument();
    expect(within(screen.getByTestId('admin.relatorios.cancellations-table')).getByText('Sem estoque')).toBeInTheDocument();
    expect(screen.getByTestId('admin.relatorios.revenue')).toBeInTheDocument();
  });

  it('o gráfico tem resumo em texto e tabela alternativa', () => {
    render(<OrdersChart series={report().series} />);
    expect(screen.getByRole('img', { name: /Pedidos por dia: 80 no período/ })).toBeInTheDocument();
    expect(screen.getByText('Ver em tabela')).toBeInTheDocument();
    expect(screen.getByText('17/11/2026')).toBeInTheDocument();
  });

  it('"Ver os N pedidos" abre a lista com o mesmo filtro (cidade vai na consulta)', async () => {
    const { impl, calls } = base((url) => (url.pathname.endsWith('/reports/orders') ? json(page([{ id: 'o1', number: '1042', store: { id: 's', name: 'Loja Azul' }, status: 'delivered', mode: 'delivery', total: money(5990), commission: money(600), paidAt: '2026-11-18T13:00:00Z', deliveredAt: null, cancelledBy: null, cancelReason: null }])) : undefined));
    vi.stubGlobal('fetch', impl);
    renderPanel(<ReportsPage />);
    await userEvent.click(await screen.findByTestId('admin.relatorios.see-orders-link'));
    expect(await screen.findByTestId('admin.relatorios.order-o1')).toHaveTextContent('Loja Azul');
    const call = calls.find((c) => c.url.pathname.endsWith('/reports/orders'))!;
    expect(call.url.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('exportar baixa o CSV pelo BFF; arquivo grande explica o que fazer', async () => {
    const saved = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = saved;
    let large = false;
    const { impl, calls } = base((url) => (url.pathname.endsWith('/reports/operations.csv') ? (large ? json({ code: 'EXPORT_TOO_LARGE', title: 'x', status: 422 }, 422) : new Response('a;b', { status: 200, headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="indicadores.csv"' } })) : undefined));
    vi.stubGlobal('fetch', impl);
    renderPanel(<ReportsPage />);
    await userEvent.click(await screen.findByTestId('admin.relatorios.export'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(calls.some((c) => c.url.pathname.endsWith('/reports/operations.csv'))).toBe(true);
    expect(await screen.findByText('Arquivo pronto.')).toBeInTheDocument();
    large = true;
    await userEvent.click(screen.getByTestId('admin.relatorios.export'));
    expect(await screen.findByTestId('admin.relatorios.export-error')).toHaveTextContent('A exportação é grande');
  });

  it('período sem dados: estado vazio com "Limpar filtros"', async () => {
    vi.stubGlobal('fetch', base((url) => (url.pathname.endsWith('/reports/operations') ? json(report({ empty: true })) : undefined)).impl);
    renderPanel(<ReportsPage />);
    expect(await screen.findByTestId('admin.relatorios.empty')).toHaveTextContent('Sem dados neste período');
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
  });

  it('operação não vê a receita; suporte não vê a tela', async () => {
    vi.stubGlobal('fetch', base().impl);
    const ops = renderPanel(<ReportsPage />, 'operations');
    await screen.findByTestId('admin.relatorios.kpi-orders');
    expect(screen.queryByTestId('admin.relatorios.revenue')).not.toBeInTheDocument();
    ops.unmount();
    renderPanel(<ReportsPage />, 'support');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});
