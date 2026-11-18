import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ProductFormPage } from './product-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lojista/produtos/novo' }));
// O recorte e o envio de foto usam canvas e XHR (cobertos no E2E): aqui a galeria só entrega uma foto já enviada.
vi.mock('./photo-gallery', () => ({
  PhotoGallery: ({ photos, onChange, error }: { photos: unknown[]; onChange: (u: (c: never[]) => never[]) => void; error?: string }) => (
    <div>
      <span data-testid="photo-count">{photos.length}</span>
      <button type="button" onClick={() => onChange((c) => [...c, { key: `k${c.length}`, assetId: `a${c.length}`, previewUrl: 'blob:x', status: 'ready', progress: 100 } as never])}>fake-photo</button>
      {error ? <span>{error}</span> : null}
    </div>
  ),
}));

const categories = { data: [{ id: 'c1', parentId: null, name: 'Roupas', icon: 'tshirt', position: 0, active: true, createdAt: '', updatedAt: '', children: [{ id: 'c2', parentId: 'c1', name: 'Camisetas', icon: 'x', position: 0, active: true, createdAt: '', updatedAt: '' }] }], nextCursor: null };
const variant = (over = {}) => ({ id: 'v1', attributes: {}, sku: null, priceCents: null, effectivePriceCents: 5990, originalPriceCents: null, discountPercent: null, stock: 10, reserved: 0, available: 10, soldOut: false, low: false, ...over });
const product = (over = {}) => ({
  id: 'p1', name: 'Camiseta Básica', description: null, categoryId: 'c1', sectionId: null, status: 'draft', moderationStatus: 'ok', moderationReason: null, basePriceCents: 5990,
  promotion: { priceCents: null, startsAt: null, endsAt: null, active: false }, variantAttributes: [], variants: [], images: [], soldOut: false, publishedAt: null, createdAt: '', updatedAt: '', ...over,
});

type Handler = Parameters<typeof mockFetch>[0];
function setup(extra: Handler[] = []) {
  return mockFetch(
    ...extra,
    (url) => (url.pathname === '/api/proxy/lojista/categories' ? json(categories) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/sections' ? json({ data: [{ id: 'sec1', name: 'Camisetas', position: 0, productCount: 1 }], nextCursor: null }) : undefined),
    ...storeHandlers(fakeStore({ status: 'approved', step: 4 })),
  );
}
const body = (calls: { url: URL; init: RequestInit }[], suffix: string, method: string) => JSON.parse(String(calls.find((c) => c.url.pathname.endsWith(suffix) && c.init.method === method)?.init.body));

beforeEach(() => {
  push.mockClear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Produto: criar (K2)', () => {
  it('publicar vazio mostra o resumo e não chama a API', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductFormPage />);
    await userEvent.click(await screen.findByTestId('lojista.produto.submit'));
    const summary = await screen.findByTestId('lojista.produto.error-summary');
    expect(summary).toHaveTextContent('4 campos precisam de atenção');
    for (const text of ['Escreva o nome do produto.', 'Escolha a categoria.', 'Adicione ao menos 1 foto.', 'Informe o preço.']) expect(within(summary).getByText(text)).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'POST' && c.url.pathname.endsWith('/products'))).toBe(false);
  });

  it('promoção: preço maior que o normal e fim antes do início são recusados', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<ProductFormPage />);
    await userEvent.type(await screen.findByTestId('lojista.produto.price-input'), '9990');
    await userEvent.click(screen.getByTestId('lojista.produto.promo-switch'));
    await userEvent.type(screen.getByTestId('lojista.produto.promo-price-input'), '12000');
    fireEvent.change(screen.getByTestId('lojista.produto.promo-start'), { target: { value: '2026-12-10T08:00' } });
    fireEvent.change(screen.getByTestId('lojista.produto.promo-end'), { target: { value: '2026-12-01T08:00' } });
    await userEvent.type(screen.getByTestId('lojista.produto.name-input'), 'Camisa');
    await userEvent.click(screen.getByTestId('lojista.produto.save-draft'));
    expect(await screen.findAllByText('O preço da promoção precisa ser menor que R$ 99,90.')).not.toHaveLength(0);
    expect(screen.getAllByText('A promoção precisa terminar depois do início.')).not.toHaveLength(0);
  });

  it('prévia viva da promoção', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<ProductFormPage />);
    await userEvent.type(await screen.findByTestId('lojista.produto.price-input'), '9990');
    await userEvent.click(screen.getByTestId('lojista.produto.promo-switch'));
    await userEvent.type(screen.getByTestId('lojista.produto.promo-price-input'), '7990');
    expect(screen.getByTestId('lojista.produto.promo-preview')).toHaveTextContent('De R$ 99,90 por R$ 79,90 · 20% off');
  });

  it('publica produto sem variação: cria com chave de idempotência, define estoque, fotos e publica', async () => {
    const { impl, calls } = setup([
      (url, init) => (url.pathname.endsWith('/products') && init.method === 'POST' ? json(product(), 201) : undefined),
      (url, init) => (url.pathname.endsWith('/products/p1') && init.method === 'PATCH' ? json(product({ promotion: { priceCents: 4990, startsAt: '2026-12-01T11:00:00Z', endsAt: '2026-12-31T11:00:00Z', active: false } })) : undefined),
      (url, init) => (url.pathname.endsWith('/variants') && init.method === 'PUT' ? json(product({ variants: [variant()] })) : undefined),
      (url, init) => (url.pathname.endsWith('/images') && init.method === 'PUT' ? json(product({ variants: [variant()], images: [{ id: 'a0', position: 0, urls: null }] })) : undefined),
      (url, init) => (url.pathname.endsWith('/publish') && init.method === 'POST' ? json(product({ status: 'active' })) : undefined),
    ]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductFormPage />);
    await userEvent.type(await screen.findByTestId('lojista.produto.name-input'), 'Camiseta Básica');
    await userEvent.selectOptions(screen.getByTestId('lojista.produto.category-select'), 'c1');
    await userEvent.type(screen.getByTestId('lojista.produto.price-input'), '5990');
    await userEvent.click(screen.getByTestId('lojista.produto.promo-switch'));
    await userEvent.type(screen.getByTestId('lojista.produto.promo-price-input'), '4990');
    fireEvent.change(screen.getByTestId('lojista.produto.promo-start'), { target: { value: '2026-12-01T08:00' } });
    fireEvent.change(screen.getByTestId('lojista.produto.promo-end'), { target: { value: '2026-12-31T08:00' } });
    await userEvent.click(screen.getByText('fake-photo'));
    await userEvent.click(screen.getByTestId('lojista.produto.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/produtos'));
    const created = calls.find((c) => c.url.pathname.endsWith('/products') && c.init.method === 'POST')!;
    expect(JSON.parse(String(created.init.body))).toMatchObject({ name: 'Camiseta Básica', categoryId: 'c1', basePriceCents: 5990 });
    expect((created.init.headers as Record<string, string>)['idempotency-key']).toMatch(/^novo-/);
    expect(body(calls, '/products/p1', 'PATCH')).toEqual({ promoPriceCents: 4990, promoStartsAt: '2026-12-01T11:00:00.000Z', promoEndsAt: '2026-12-31T11:00:00.000Z' });
    expect(body(calls, '/variants', 'PUT')).toEqual({ attributes: [], variants: [{ attributes: {}, stock: 10, priceCents: null, sku: null }] });
    expect(body(calls, '/images', 'PUT')).toEqual({ imageIds: ['a0'] });
    expect(calls.some((c) => c.url.pathname.endsWith('/publish'))).toBe(true);
  });

  it('com variações: monta as combinações, mostra o resumo e envia estoque por variação', async () => {
    const { impl, calls } = setup([
      (url, init) => (url.pathname.endsWith('/products') && init.method === 'POST' ? json(product(), 201) : undefined),
      (url, init) => (url.pathname.endsWith('/products/p1') && init.method === 'PATCH' ? json(product()) : undefined),
      (url, init) => (url.pathname.endsWith('/variants') && init.method === 'PUT' ? json(product({ variantAttributes: ['Tamanho', 'Cor'], variants: [variant()] })) : undefined),
      (url, init) => (url.pathname.endsWith('/images') && init.method === 'PUT' ? json(product({ images: [{ id: 'a0', position: 0, urls: null }] })) : undefined),
      (url, init) => (url.pathname.endsWith('/publish') && init.method === 'POST' ? json(product({ status: 'active' })) : undefined),
    ]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductFormPage />);
    await userEvent.type(await screen.findByTestId('lojista.produto.name-input'), 'Camiseta Básica');
    await userEvent.selectOptions(screen.getByTestId('lojista.produto.category-select'), 'c1');
    await userEvent.type(screen.getByTestId('lojista.produto.price-input'), '5990');
    await userEvent.click(screen.getByText('fake-photo'));
    await userEvent.click(screen.getByTestId('lojista.produto.variations-radio'));

    // K3
    await userEvent.click(await screen.findByTestId('lojista.variacoes.attr-add-size'));
    await userEvent.click(screen.getByRole('button', { name: 'P' }));
    await userEvent.click(screen.getByRole('button', { name: 'M' }));
    await userEvent.click(screen.getByTestId('lojista.variacoes.attr-add-color'));
    await userEvent.click(screen.getByRole('button', { name: 'Preto' }));
    await userEvent.type(screen.getByTestId('lojista.variacoes.value-input-cor'), 'Azul Marinho');
    await userEvent.click(screen.getByTestId('lojista.variacoes.value-add-cor'));
    expect(screen.getByTestId('lojista.variacoes.summary')).toHaveTextContent('4 opções · 40 em estoque');
    // estoque por variação
    const first = screen.getByTestId('lojista.variacoes.row-0-stock');
    await userEvent.clear(first);
    await userEvent.type(first, '3');
    // duplicata é ignorada
    await userEvent.type(screen.getByTestId('lojista.variacoes.value-input-cor'), 'preto');
    await userEvent.click(screen.getByTestId('lojista.variacoes.value-add-cor'));
    expect(screen.getByTestId('lojista.variacoes.summary')).toHaveTextContent('4 opções · 33 em estoque');
    await userEvent.click(screen.getByTestId('lojista.variacoes.row-3-remove'));
    expect(screen.getByTestId('lojista.variacoes.summary')).toHaveTextContent('3 opções · 23 em estoque');
    await userEvent.click(screen.getByTestId('lojista.variacoes.row-1-price-toggle'));
    await userEvent.type(screen.getByTestId('lojista.variacoes.row-1-price'), '6490');
    await userEvent.click(screen.getByTestId('lojista.variacoes.submit'));

    expect(await screen.findByTestId('lojista.produto.variations-summary')).toHaveTextContent('23 em 3 opções');
    await userEvent.click(screen.getByTestId('lojista.produto.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/produtos'));
    const sent = body(calls, '/variants', 'PUT');
    expect(sent.attributes).toEqual(['Tamanho', 'Cor']);
    expect(sent.variants).toEqual([
      { attributes: { Tamanho: 'P', Cor: 'Preto' }, stock: 3, priceCents: null, sku: null },
      { attributes: { Tamanho: 'P', Cor: 'Azul Marinho' }, stock: 10, priceCents: 6490, sku: null },
      { attributes: { Tamanho: 'M', Cor: 'Preto' }, stock: 10, priceCents: null, sku: null },
    ]);
  });

  it('erro do servidor ao publicar mostra o motivo e mantém o que foi digitado; repetir não cria um segundo produto', async () => {
    let publishes = 0;
    const { impl, calls } = setup([
      (url, init) => (url.pathname.endsWith('/products') && init.method === 'POST' ? json(product(), 201) : undefined),
      (url, init) => (url.pathname.endsWith('/products/p1') && init.method === 'PATCH' ? json(product()) : undefined),
      (url, init) => (url.pathname.endsWith('/variants') && init.method === 'PUT' ? json(product({ variants: [variant()] })) : undefined),
      (url, init) => (url.pathname.endsWith('/images') && init.method === 'PUT' ? json(product({ variants: [variant()], images: [{ id: 'a0', position: 0, urls: null }] })) : undefined),
      (url, init) => (url.pathname.endsWith('/publish') && init.method === 'POST' ? (++publishes === 1 ? json({ code: 'CATEGORY_FORBIDDEN', title: 'x', status: 422 }, 422) : json(product({ status: 'active' }))) : undefined),
    ]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductFormPage />);
    await userEvent.type(await screen.findByTestId('lojista.produto.name-input'), 'Camiseta Básica');
    await userEvent.selectOptions(screen.getByTestId('lojista.produto.category-select'), 'c1');
    await userEvent.type(screen.getByTestId('lojista.produto.price-input'), '5990');
    await userEvent.click(screen.getByText('fake-photo'));
    await userEvent.click(screen.getByTestId('lojista.produto.submit'));
    expect(await screen.findByTestId('lojista.produto.error')).toHaveTextContent('Esse tipo de produto não é permitido no Webag.');
    expect(screen.getByTestId('lojista.produto.name-input')).toHaveValue('Camiseta Básica');
    await userEvent.click(screen.getByTestId('lojista.produto.submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(calls.filter((c) => c.url.pathname.endsWith('/products') && c.init.method === 'POST')).toHaveLength(1);
  });

  it('rascunho local: o que foi digitado volta depois de recarregar', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const first = renderLojista(<ProductFormPage />);
    await userEvent.type(await screen.findByTestId('lojista.produto.name-input'), 'Bolsa');
    first.result.unmount();
    renderLojista(<ProductFormPage />);
    expect(await screen.findByTestId('lojista.produto.name-input')).toHaveValue('Bolsa');
  });
});

describe('Produto: editar e arquivar', () => {
  const existing = product({ status: 'active', variants: [variant()], images: [{ id: 'a0', position: 0, urls: { '160': 'http://x/a.webp' } }] });
  const getHandler: Handler = (url, init) => (url.pathname.endsWith('/products/p1') && (init.method ?? 'GET') === 'GET' ? json(existing) : undefined);

  it('carrega o produto e salva só o que mudou', async () => {
    const { impl, calls } = setup([getHandler, (url, init) => (url.pathname.endsWith('/products/p1') && init.method === 'PATCH' ? json(existing) : undefined)]);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProductFormPage productId="p1" />);
    const name = await screen.findByTestId('lojista.produto.name-input');
    expect(name).toHaveValue('Camiseta Básica');
    expect(screen.getByTestId('lojista.produto.price-input')).toHaveValue('59,90');
    expect(screen.getByTestId('lojista.produto.submit')).toHaveTextContent('Salvar alterações');
    expect(screen.queryByTestId('lojista.produto.save-draft')).not.toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.type(name, 'Camiseta Premium');
    await userEvent.click(screen.getByTestId('lojista.produto.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/produtos'));
    expect(body(calls, '/products/p1', 'PATCH')).toMatchObject({ name: 'Camiseta Premium', basePriceCents: 5990 });
    expect(calls.some((c) => c.url.pathname.endsWith('/images'))).toBe(false);
    expect(calls.some((c) => c.url.pathname.endsWith('/variants'))).toBe(false);
  });

  it('arquivar com pedido em andamento bloqueia com a explicação', async () => {
    vi.stubGlobal('fetch', setup([getHandler, (url, init) => (url.pathname.endsWith('/products/p1') && init.method === 'DELETE' ? json({ code: 'OPEN_ORDERS', title: 'x', status: 409 }, 409) : undefined)]).impl);
    renderLojista(<ProductFormPage productId="p1" />);
    await userEvent.click(await screen.findByTestId('lojista.produto.more-menu'));
    await userEvent.click(screen.getByTestId('lojista.produto.archive'));
    expect(screen.getByText('Arquivar Camiseta Básica?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.produto.archive-confirm'));
    expect(await screen.findByTestId('lojista.produto.archive-error')).toHaveTextContent('Há pedidos em andamento com esse produto. Pause o produto e arquive depois.');
  });

  it('produto pausado pela moderação mostra o motivo', async () => {
    vi.stubGlobal('fetch', setup([(url) => (url.pathname.endsWith('/products/p1') ? json({ ...existing, moderationStatus: 'paused', moderationReason: 'Produto proibido' }) : undefined)]).impl);
    renderLojista(<ProductFormPage productId="p1" />);
    expect(await screen.findByTestId('lojista.produto.moderation')).toHaveTextContent('Produto proibido');
  });
});
