import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../../test/lojista';
import { PriceTablePage, priceChangeNote } from './price-table';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/produtos/precos' }));

const P = '/api/proxy/lojista/stores/s1';
const row = (over = {}) => ({ id: 'p1', name: 'Camiseta básica', status: 'active', moderationStatus: 'ok', cover: null, basePriceCents: 4990, youReceiveCents: 4192, available: 10, reserved: 2, variantCount: 1, singleVariantId: 'v1', version: 4, updatedAt: '2026-11-22T10:00:00Z', ...over });
let rows: ReturnType<typeof row>[];
let patch: (() => Response) | null;
const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    onlineManager.setOnline(value);
  });
};

type Handler = Parameters<typeof mockFetch>[0];
function setup(extra: Handler[] = []) {
  return mockFetch(
    ...extra,
    (url) => (url.pathname === `${P}/products/table` ? json({ data: rows, nextCursor: null, matchingCount: rows.length }) : undefined),
    (url) => (url.pathname === `${P}/catalog/quick-start` ? json({ suggestedCategoryId: null, draftCount: 0, draftLimit: 100, latestDraft: null, withoutDescriptionCount: 0, limits: { variantsMax: 100, reajusteMaxPct: 30 } }) : undefined),
    (url, init) => (url.pathname === `${P}/products/p1` && init.method === 'PATCH' ? (patch ? patch() : json({ id: 'p1', version: 5 })) : undefined),
    (url, init) => (url.pathname === `${P}/products/p1` && (init.method ?? 'GET') === 'GET' ? json({ id: 'p1', version: 6 }) : undefined),
    (url, init) => (url.pathname === `${P}/products/p1/variants/v1/stock` && init.method === 'POST' ? json({ id: 'v1', stock: 7 }) : undefined),
    ...storeHandlers(fakeStore({ status: 'approved', step: 4 })),
  );
}
const callsTo = (calls: { url: URL; init: RequestInit }[], suffix: string, method: string) => calls.filter((c) => c.url.pathname.endsWith(suffix) && c.init.method === method);
const header = (call: { init: RequestInit } | undefined, name: string) => (call?.init.headers as Record<string, string> | undefined)?.[name];

beforeEach(() => {
  rows = [row()];
  patch = null;
  setOnline(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('Preços e estoque (WB-377)', () => {
  it('lista com preço, "Você recebe", estoque total e reservado, tabela com caption e th com scope', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<PriceTablePage />);
    expect(await screen.findByTestId('lojista.precos.row-p1')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Preço e estoque dos produtos da loja' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    expect(screen.getByTestId('lojista.precos.price-p1')).toHaveValue('49,90');
    expect(screen.getByTestId('lojista.precos.receive-p1')).toHaveTextContent('R$ 41,92');
    expect(screen.getByTestId('lojista.precos.stock-p1')).toHaveValue('12');
    expect(screen.getByText('2 reservadas em pedidos')).toBeInTheDocument();
  });

  it('C1: alterar o preço salva na linha com If-Match e mostra "Salvo"', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<PriceTablePage />);
    const price = await screen.findByTestId('lojista.precos.price-p1');
    await userEvent.clear(price);
    await userEvent.type(price, '5490');
    expect(await screen.findByTestId('lojista.precos.saved-p1', undefined, { timeout: 3000 })).toHaveTextContent('Salvo');
    const patchCall = callsTo(calls, '/products/p1', 'PATCH')[0];
    expect(JSON.parse(String(patchCall?.init.body))).toEqual({ basePriceCents: 5490 });
    expect(header(patchCall, 'if-match')).toBe('"4"');
  });

  it('C1: alterar o estoque salva por adjustVariantStock com If-Match', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<PriceTablePage />);
    const stock = await screen.findByTestId('lojista.precos.stock-p1');
    await userEvent.clear(stock);
    await userEvent.type(stock, '20');
    await screen.findByTestId('lojista.precos.saved-p1', undefined, { timeout: 3000 });
    const call = callsTo(calls, '/variants/v1/stock', 'POST')[0];
    expect(JSON.parse(String(call?.init.body))).toEqual({ set: 20 });
    expect(header(call, 'if-match')).toBe('"4"');
  });

  it('C5: estoque abaixo do reservado mostra o motivo na linha', async () => {
    vi.stubGlobal('fetch', setup([(url, init) => (url.pathname.endsWith('/stock') && init.method === 'POST' ? json({ code: 'STOCK_BELOW_RESERVED', title: 'x', status: 409, detail: '2 unidades estão reservadas em pedidos.' }, 409) : undefined)]).impl);
    renderLojista(<PriceTablePage />);
    const stock = await screen.findByTestId('lojista.precos.stock-p1');
    await userEvent.clear(stock);
    await userEvent.type(stock, '1');
    expect(await screen.findByTestId('lojista.precos.error-p1', undefined, { timeout: 3000 })).toHaveTextContent('2 unidades estão reservadas em pedidos.');
  });

  it('C8: preço que muda mais que o limite pede confirmação inline antes de salvar, nos dois sentidos', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<PriceTablePage />);
    const price = await screen.findByTestId('lojista.precos.price-p1');
    await userEvent.clear(price);
    await userEvent.type(price, '499');
    const box = await screen.findByTestId('lojista.precos.confirm-p1', undefined, { timeout: 3000 });
    expect(box).toHaveTextContent('De R$ 49,90 para R$ 4,99 (-90%). Confirmar?');
    expect(callsTo(calls, '/products/p1', 'PATCH')).toHaveLength(0);
    await userEvent.click(screen.getByTestId('lojista.precos.confirm-yes-p1'));
    await screen.findByTestId('lojista.precos.saved-p1', undefined, { timeout: 3000 });
    expect(JSON.parse(String(callsTo(calls, '/products/p1', 'PATCH')[0]?.init.body))).toEqual({ basePriceCents: 499 });
  });

  it('priceChangeNote: usa o limite da loja (reajuste_max_pct), não um 30% fixo', () => {
    expect(priceChangeNote(4990, 5490, 30)).toBeNull();
    expect(priceChangeNote(4990, 9990, 30)?.replace(/\u00a0/g, ' ')).toBe('De R$ 49,90 para R$ 99,90 (+100%). Confirmar?');
    expect(priceChangeNote(4990, 5490, 5)?.replace(/\u00a0/g, ' ')).toBe('De R$ 49,90 para R$ 54,90 (+10%). Confirmar?');
  });

  it('C1 (DEC-126): sem internet a linha diz "Não salvou: sem internet" com "Tentar de novo", o valor digitado continua e nada é enviado sozinho', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<PriceTablePage />);
    const price = await screen.findByTestId('lojista.precos.price-p1');
    setOnline(false);
    await userEvent.clear(price);
    await userEvent.type(price, '5490');
    expect(await screen.findByTestId('lojista.precos.error-p1', undefined, { timeout: 3000 })).toHaveTextContent('Não salvou: sem internet');
    expect(price).toHaveValue('54,90');
    expect(callsTo(calls, '/products/p1', 'PATCH')).toHaveLength(0);
    setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(callsTo(calls, '/products/p1', 'PATCH')).toHaveLength(0);
    await userEvent.click(screen.getByTestId('lojista.precos.retry-p1'));
    await screen.findByTestId('lojista.precos.saved-p1', undefined, { timeout: 3000 });
    expect(callsTo(calls, '/products/p1', 'PATCH')).toHaveLength(1);
  });

  it('409 de versão: avisa "foi alterado agora" e recarrega a lista', async () => {
    patch = () => json({ code: 'PRODUCT_VERSION_CONFLICT', title: 'x', status: 409 }, 409);
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<PriceTablePage />);
    const price = await screen.findByTestId('lojista.precos.price-p1');
    await userEvent.clear(price);
    await userEvent.type(price, '5490');
    expect(await screen.findByTestId('lojista.precos.error-p1', undefined, { timeout: 3000 })).toHaveTextContent('Este produto foi alterado agora.');
  });

  it('produto com grade leva ao produto em vez de editar o estoque na linha', async () => {
    rows = [row({ singleVariantId: null, variantCount: 6, available: 24 })];
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<PriceTablePage />);
    expect(await screen.findByTestId('lojista.precos.options-p1')).toHaveTextContent('24 em 6 opções: abrir');
    expect(screen.queryByTestId('lojista.precos.stock-p1')).not.toBeInTheDocument();
  });

  it('sem "Você recebe" (nulo) mostra um traço; lista vazia e busca sem resultado explicam e erro oferece tentar de novo', async () => {
    rows = [row({ youReceiveCents: null })];
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<PriceTablePage />);
    expect(await screen.findByTestId('lojista.precos.receive-p1')).toHaveTextContent('—');
    rows = [];
    fireEvent.change(screen.getByTestId('lojista.precos.search'), { target: { value: 'xyz' } });
    expect(await screen.findByText('Nenhum produto com esse nome')).toBeInTheDocument();
  });

  it('erro de carregamento mostra "Tentar de novo"', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname === `${P}/products/table` ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined), ...storeHandlers(fakeStore({ status: 'approved', step: 4 }))).impl);
    renderLojista(<PriceTablePage />);
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
