import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueRow } from '@/lib/api/admin-stores';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { filtersToQuery, NO_FILTERS } from './all-stores';
import { QueuePage } from './queue-page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace }), usePathname: () => '/admin/lojas' }));

const row = (id: string, over: Partial<QueueRow> = {}): QueueRow => ({ id, name: `Loja ${id}`, status: 'approved', documentMasked: '***', city: 'Francisco Morato', submittedAt: null, overdue: false, holderMismatch: false, activeProducts: 4, orders30d: 3, sales30dCents: 125000, commissionPct: 12, commissionSource: 'default', ...over });

function server(rows: QueueRow[] = [row('a')]) {
  const queries: URLSearchParams[] = [];
  const mock = mockFetch((url) => {
    if (path(url) !== 'admin/stores') return undefined;
    queries.push(url.searchParams);
    return json({ data: rows, nextCursor: null });
  });
  return { ...mock, queries };
}

beforeEach(() => replace.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('Todas as lojas (WB-350 C1, C3)', () => {
  it('colunas: produtos ativos ("Nenhum" em âmbar), vendas em 30 dias ("Sem pedidos"), comissão com selo "Própria"', async () => {
    const mock = server([row('a', { name: 'Moda Morato' }), row('b', { name: 'Padaria Sol', activeProducts: 0, orders30d: 0, sales30dCents: 0, commissionPct: 8, commissionSource: 'store' })]);
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<QueuePage initialTab="all" />, 'finance');
    const first = await screen.findByTestId('admin.lojas.row-a');
    expect(within(first).getByText('R$ 1.250,00')).toBeInTheDocument();
    expect(within(first).getByText('12%')).toBeInTheDocument();
    expect(within(first).queryByText('Própria')).not.toBeInTheDocument();
    const second = screen.getByTestId('admin.lojas.row-b');
    expect(within(second).getByText('Nenhum')).toBeInTheDocument();
    expect(within(second).getByText('Sem pedidos')).toBeInTheDocument();
    expect(within(second).getByText('Própria')).toBeInTheDocument();
    expect(screen.getByTestId('admin.lojas.count')).toHaveTextContent('2 lojas');
    expect(mock.queries[0]!.get('status')).toBe('all');
  });

  it('busca e atalhos vão para o servidor e para a URL', async () => {
    const mock = server();
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<QueuePage initialTab="all" />, 'support');
    await screen.findByTestId('admin.lojas.row-a');
    await userEvent.type(screen.getByLabelText('Buscar por nome ou cidade'), 'Morato');
    await waitFor(() => expect(mock.queries.at(-1)!.get('q')).toBe('Morato'));
    expect(replace).toHaveBeenLastCalledWith('/admin/lojas?aba=todas&q=Morato');
    await userEvent.click(screen.getByTestId('admin.lojas.no-product'));
    await waitFor(() => expect(mock.queries.at(-1)!.get('noActiveProduct')).toBe('true'));
    await userEvent.click(screen.getByTestId('admin.lojas.own-commission'));
    await waitFor(() => expect(mock.queries.at(-1)!.get('ownCommission')).toBe('true'));
    await userEvent.click(screen.getByTestId('admin.lojas.situation-suspended'));
    await waitFor(() => expect(mock.queries.at(-1)!.get('status')).toBe('suspended'));
    expect(replace).toHaveBeenLastCalledWith('/admin/lojas?aba=todas&q=Morato&situacao=suspended&semproduto=1&propria=1');
    expect(screen.getByTestId('admin.lojas.no-product')).toHaveAttribute('aria-pressed', 'true');
  });

  it('filtros vindos da URL e a montagem da query são simétricos', () => {
    expect(filtersToQuery(NO_FILTERS)).toBe('aba=todas');
    expect(filtersToQuery({ q: 'a b', situation: 'approved', noProduct: true, ownCommission: false })).toBe('aba=todas&q=a+b&situacao=approved&semproduto=1');
  });

  it('vazio sem filtro, sem resultado com filtro (com "Limpar filtros") e erro com tentar de novo', async () => {
    vi.stubGlobal('fetch', server([]).impl);
    const first = renderPanel(<QueuePage initialTab="all" />, 'operations');
    expect(await screen.findByTestId('admin.lojas.empty')).toHaveTextContent('Ainda não há lojas');
    first.unmount();
    const mock = server([]);
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<QueuePage initialTab="all" initialFilters={{ ...NO_FILTERS, noProduct: true }} />, 'operations');
    expect(await screen.findByTestId('admin.lojas.empty-filter')).toHaveTextContent('Nenhuma loja com esses filtros');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(mock.queries.at(-1)!.has('noActiveProduct')).toBe(false));
  });

  it('erro: "Tentar de novo" refaz a busca', async () => {
    let fail = true;
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/stores' ? (fail ? json({ code: 'X', title: 'x', status: 500 }, 500) : json({ data: [row('a')], nextCursor: null })) : undefined)).impl);
    renderPanel(<QueuePage initialTab="all" />, 'operations');
    expect(await screen.findByText('Não conseguimos carregar agora')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByTestId('admin.lojas.row-a')).toBeInTheDocument();
  });
});
