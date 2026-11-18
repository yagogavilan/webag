import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '@/lib/api/catalog';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ProductsPage } from './products-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/produtos' }));

const summary = (over: Partial<ProductSummary> & { id: string; name: string }): ProductSummary => ({
  status: 'active',
  moderationStatus: 'ok',
  sectionId: null,
  basePriceCents: 5990,
  fromPriceCents: 5990,
  cover: null,
  availableTotal: 12,
  low: false,
  soldOut: false,
  variantCount: 1,
  updatedAt: '2026-11-18T12:00:00.000Z',
  ...over,
});
const camiseta = summary({ id: 'p1', name: 'Camiseta Básica' });
const tenis = summary({ id: 'p2', name: 'Tênis Corrida', status: 'paused', basePriceCents: 19990, fromPriceCents: 19990, availableTotal: 3, low: true });
const bone = summary({ id: 'p3', name: 'Boné', variantCount: 6, availableTotal: 24, basePriceCents: 4990, fromPriceCents: 3990 });
const detail = { id: 'p1', variants: [{ id: 'v1', attributes: {}, stock: 12, reserved: 0 }] };

type Handler = Parameters<typeof mockFetch>[0];
function setup(products: ProductSummary[], extra: Handler[] = [], storeOver = {}) {
  const store = fakeStore({ status: 'approved', step: 4, ...storeOver });
  return mockFetch(
    ...extra,
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/products' ? json({ data: products, nextCursor: null }) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/sections' ? json({ data: [{ id: 'sec1', name: 'Camisetas', position: 0, productCount: 2 }], nextCursor: null }) : undefined),
    ...storeHandlers(store),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Produtos: lista (K1)', () => {
  it('mostra preço, estoque, selos e o estado de venda com texto', async () => {
    vi.stubGlobal('fetch', setup([camiseta, tenis, bone]).impl);
    renderLojista(<ProductsPage />);
    const row = await screen.findByTestId('lojista.produtos.row-p1');
    expect(within(row).getByText('R$ 59,90')).toBeInTheDocument();
    expect(within(row).getByRole('switch', { name: 'Camiseta Básica, vendendo' })).toBeChecked();
    const paused = screen.getByTestId('lojista.produtos.row-p2');
    expect(within(paused).getByRole('switch', { name: 'Tênis Corrida, pausado' })).not.toBeChecked();
    expect(within(paused).getByText('Baixo')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.produtos.row-p3-stock-open')).toHaveTextContent('24 em 6 opções');
    expect(within(screen.getByTestId('lojista.produtos.row-p3')).getByText('a partir de R$ 39,90')).toBeInTheDocument();
  });

  it('vazio sem filtro oferece adicionar e importar', async () => {
    vi.stubGlobal('fetch', setup([]).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByText('Sua vitrine está vazia')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Importar planilha' }).length).toBeGreaterThan(0);
  });

  it('filtro e busca vão para a API; sem resultado oferece limpar filtros', async () => {
    const { impl, calls } = setup([]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductsPage />);
    await screen.findByText('Sua vitrine está vazia');
    await userEvent.click(screen.getByTestId('lojista.produtos.filter-low'));
    expect(await screen.findByText('Nenhum produto neste filtro.')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/products') && c.url.searchParams.get('lowStock') === 'true')).toBe(true));
    await userEvent.type(screen.getByTestId('lojista.produtos.search-input'), 'camisa');
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get('q') === 'camisa')).toBe(true));
    await userEvent.click(screen.getByTestId('lojista.produtos.clear-filters'));
    expect(await screen.findByText('Sua vitrine está vazia')).toBeInTheDocument();
  });

  it('erro ao carregar mostra tentar de novo', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/products') ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined), ...storeHandlers(fakeStore({ status: 'approved', step: 4 }))).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByText('Não conseguimos carregar agora')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('pausar com 1 toque salva e oferece desfazer', async () => {
    const { impl, calls } = setup([camiseta], [(url, init) => (url.pathname.endsWith('/products/p1/pause') && init.method === 'POST' ? json({ id: 'p1', status: 'paused' }) : undefined)]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductsPage />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Camiseta Básica, vendendo' }));
    expect(await screen.findByText('Camiseta Básica pausada.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/products/p1/pause'))).toBe(true);
    expect(screen.getByTestId('toast-action')).toHaveTextContent('Desfazer');
  });

  it('erro ao pausar: o switch volta e a linha explica', async () => {
    vi.stubGlobal('fetch', setup([camiseta], [(url) => (url.pathname.endsWith('/products/p1/pause') ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined)]).impl);
    renderLojista(<ProductsPage />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Camiseta Básica, vendendo' }));
    expect(await screen.findByText('Não foi possível salvar. Tentar de novo.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Camiseta Básica, vendendo' })).toBeChecked();
  });

  it('estoque: + agrupa os toques e envia a soma como delta', async () => {
    const { impl, calls } = setup([camiseta], [
      (url) => (url.pathname.endsWith('/products/p1') ? json(detail) : undefined),
      (url, init) => (url.pathname.endsWith('/variants/v1/stock') && init.method === 'POST' ? json({ id: 'v1', stock: 14 }) : undefined),
    ]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductsPage />);
    const plus = await screen.findByTestId('lojista.produtos.row-p1-stock-plus');
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(screen.getByLabelText('Estoque, 14')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.url.pathname.endsWith('/stock'))).toHaveLength(1), { timeout: 3000 });
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/stock'))!.init.body))).toEqual({ delta: 2 });
  });

  it('estoque abaixo do reservado mostra a mensagem do servidor e volta ao valor', async () => {
    vi.stubGlobal(
      'fetch',
      setup([camiseta], [
        (url) => (url.pathname.endsWith('/products/p1') ? json(detail) : undefined),
        (url) => (url.pathname.endsWith('/stock') ? json({ code: 'STOCK_BELOW_RESERVED', title: 'x', status: 409, detail: '2 unidades estão reservadas em pedidos. O mínimo é 2.' }, 409) : undefined),
      ]).impl,
    );
    renderLojista(<ProductsPage />);
    await userEvent.click(await screen.findByTestId('lojista.produtos.row-p1-stock-minus'));
    expect(await screen.findByText('2 unidades estão reservadas em pedidos. O mínimo é 2.', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Estoque, 12')).toBeInTheDocument();
  });

  it('ação em massa: seleciona, confirma com a contagem e manda a ação', async () => {
    const { impl, calls } = setup([camiseta, tenis], [(url, init) => (url.pathname.endsWith('/products/bulk') && init.method === 'POST' ? json({ dryRun: false, willChange: 2, changed: 2, blocked: [] }) : undefined)]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductsPage />);
    await userEvent.click(await screen.findByTestId('lojista.produtos.select-p1'));
    await userEvent.click(screen.getByTestId('lojista.produtos.select-p2'));
    expect(screen.getByTestId('lojista.produtos.bulk-bar')).toHaveTextContent('2 selecionados');
    await userEvent.click(screen.getByTestId('lojista.produtos.bulk-pause'));
    const confirm = screen.getByTestId('lojista.produtos.bulk-confirm');
    expect(confirm).toHaveTextContent('Pausar 2 produtos');
    await userEvent.click(confirm);
    expect(await screen.findByText('2 produtos atualizados.')).toBeInTheDocument();
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/bulk'))!.init.body))).toEqual({ productIds: ['p1', 'p2'], action: { type: 'pause' } });
    expect(screen.queryByTestId('lojista.produtos.bulk-bar')).not.toBeInTheDocument();
  });

  it('mudar preço mostra a prévia e bloqueia o que ficaria abaixo de R$ 0,01', async () => {
    vi.stubGlobal('fetch', setup([camiseta, bone]).impl);
    renderLojista(<ProductsPage />);
    await userEvent.click(await screen.findByTestId('lojista.produtos.select-p1'));
    await userEvent.click(screen.getByTestId('lojista.produtos.select-p3'));
    await userEvent.click(screen.getByTestId('lojista.produtos.bulk-price'));
    await userEvent.type(screen.getByTestId('lojista.produtos.bulk-value'), '10');
    const preview = screen.getByTestId('lojista.produtos.bulk-preview');
    expect(preview).toHaveTextContent('2 produtos serão alterados.');
    expect(preview).toHaveTextContent('Camiseta Básica: R$ 59,90 → R$ 65,89');
    expect(screen.getByTestId('lojista.produtos.bulk-confirm')).toHaveTextContent('Aumentar preço de 2 produtos');
    await userEvent.click(screen.getByTestId('lojista.produtos.bulk-direction-down'));
    await userEvent.clear(screen.getByTestId('lojista.produtos.bulk-value'));
    await userEvent.type(screen.getByTestId('lojista.produtos.bulk-value'), '100');
    expect(screen.getByTestId('lojista.produtos.bulk-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('lojista.produtos.bulk-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('lojista.produtos.bulk-adjust-again')).toBeInTheDocument();
  });

  it('funcionário com Catálogo e estoque não vê "Mudar preço"', async () => {
    vi.stubGlobal('fetch', setup([camiseta], [], { role: 'staff', permissions: ['catalog'] }).impl);
    renderLojista(<ProductsPage />);
    await userEvent.click(await screen.findByTestId('lojista.produtos.select-p1'));
    expect(screen.getByTestId('lojista.produtos.bulk-pause')).toBeInTheDocument();
    expect(screen.queryByTestId('lojista.produtos.bulk-price')).not.toBeInTheDocument();
  });

  it('funcionário sem a permissão vê "Você não tem acesso a essa área"', async () => {
    vi.stubGlobal('fetch', setup([], [], { role: 'staff', permissions: ['orders'] }).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByText('Você não tem acesso a essa área')).toBeInTheDocument();
  });

  it('funcionário sem permissão, que o cliente não conhece: a API nega e a tela mostra sem acesso', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/products') ? json({ code: 'FORBIDDEN', title: 'x', status: 403 }, 403) : undefined), ...storeHandlers(fakeStore({ status: 'approved', step: 4, role: 'staff' }))).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByText('Você não tem acesso a essa área')).toBeInTheDocument();
  });

  it('loja em análise: o catálogo explica que abre depois da aprovação', async () => {
    vi.stubGlobal('fetch', setup([], [], { status: 'in_review' }).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByText('O catálogo abre quando a sua loja for aprovada')).toBeInTheDocument();
  });
});
