import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ProductsPage } from './products-page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lojista/produtos' }));
afterEach(() => vi.unstubAllGlobals());

const P = '/api/proxy/lojista/stores/s1';
const latest = { id: 'd1', name: 'Camiseta básica preta', basePriceCents: null, cover: null, missing: ['price'], updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), expiresAt: '2026-12-22T00:00:00Z', expiresInDays: 30, version: 3, via: 'camera' };
const start = (over = {}) => ({ suggestedCategoryId: null, draftCount: 1, draftLimit: 100, latestDraft: latest, withoutDescriptionCount: 12, limits: { variantsMax: 100, reajusteMaxPct: 30 }, ...over });

function setup(products: unknown[], quick: unknown = start()) {
  return mockFetch(
    (url) => (url.pathname === `${P}/catalog/quick-start` ? json(quick) : undefined),
    (url) => (url.pathname === `${P}/product-drafts` ? json({ data: [latest], nextCursor: null, count: 1, limit: 100 }) : undefined),
    (url) => (url.pathname === `${P}/products` ? json({ data: products, nextCursor: null }) : undefined),
    (url) => (url.pathname === `${P}/sections` ? json({ data: [], nextCursor: null }) : undefined),
    ...storeHandlers(fakeStore({ status: 'approved', step: 4 })),
  );
}

describe('Produtos: cadastro rápido na lista (WB-371, WB-377 atalhos, RN-Q1)', () => {
  it('C1: mostra "Continuar: <nome>" no topo, com o que falta, apontando para a tela do rascunho', async () => {
    vi.stubGlobal('fetch', setup([]).impl);
    renderLojista(<ProductsPage />);
    const card = await screen.findByTestId('lojista.produtos.continue');
    expect(card).toHaveTextContent('Continuar: Camiseta básica preta');
    expect(card).toHaveTextContent('Falta o preço');
    expect(within(card).getByRole('link', { name: 'Continuar Camiseta básica preta' })).toHaveAttribute('href', '/lojista/produtos/novo/d1');
  });

  it('lembrete "X produtos sem descrição" não bloqueia nada', async () => {
    vi.stubGlobal('fetch', setup([]).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByTestId('lojista.produtos.without-description')).toHaveTextContent('12 produtos sem descrição');
  });

  it('a lista abre mesmo se o ponto de partida falhar', async () => {
    const { impl } = mockFetch(
      (url) => (url.pathname === `${P}/catalog/quick-start` ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined),
      (url) => (url.pathname === `${P}/products` ? json({ data: [], nextCursor: null }) : undefined),
      ...storeHandlers(fakeStore({ status: 'approved', step: 4 })),
    );
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByText('Sua vitrine está vazia')).toBeInTheDocument();
    expect(screen.queryByTestId('lojista.produtos.continue')).not.toBeInTheDocument();
  });

  it('vitrine vazia: "Novo produto" e o link "Colar lista do WhatsApp"', async () => {
    vi.stubGlobal('fetch', setup([], start({ latestDraft: null, withoutDescriptionCount: 0 })).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByText('Tire a foto de um produto para começar. Leva cerca de 1 minuto.')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.produtos.empty-paste')).toHaveAttribute('href', '/lojista/produtos/adicionar-varios');
    expect(screen.getByTestId('lojista.produtos.empty-add')).toHaveAttribute('href', '/lojista/produtos/novo');
  });

  it('C6: o filtro "Rascunhos" mostra a lista de rascunhos (e não a de produtos)', async () => {
    const { impl, calls } = setup([]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductsPage initialFilter="draft" />);
    expect(await screen.findByRole('heading', { name: 'Rascunhos (1)' })).toBeInTheDocument();
    // (a chamada `?status=active&limit=1` é da loja, não da lista)
    expect(calls.some((c) => c.url.pathname === `${P}/products` && c.url.searchParams.get('limit') === '25')).toBe(false);
    expect(screen.queryByTestId('lojista.produtos.continue')).not.toBeInTheDocument();
  });

  it('atalhos do cabeçalho: Adicionar vários e Preços e estoque', async () => {
    vi.stubGlobal('fetch', setup([]).impl);
    renderLojista(<ProductsPage />);
    expect(await screen.findByTestId('lojista.produtos.paste-link')).toHaveAttribute('href', '/lojista/produtos/adicionar-varios');
    expect(screen.getByTestId('lojista.produtos.prices-link')).toHaveAttribute('href', '/lojista/produtos/precos');
    await userEvent.click(screen.getByTestId('lojista.produtos.filter-draft'));
    expect(await screen.findByRole('heading', { name: 'Rascunhos (1)' })).toBeInTheDocument();
  });
});
