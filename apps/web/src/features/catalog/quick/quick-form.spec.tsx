import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../../test/lojista';
import { writeQuickCopy } from '@/lib/catalog/local-copy';
import { timing } from './quick-publish';
import { QuickProductPage } from './quick-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lojista/produtos/novo/p1' }));

// Recorte, compressão e envio usam canvas e XHR (coberto em quick-photos.spec): aqui a galeria só entrega fotos prontas ou em envio.
vi.mock('./quick-photos', () => ({
  QuickPhotos: ({ photos, onChange, error, onAdded }: { photos: { key: string; status: string; progress: number }[]; onChange: (u: (c: never[]) => never[]) => void; error?: string; onAdded?: () => void }) => (
    <div>
      <span data-testid="photo-count">{photos.length}</span>
      <button type="button" data-testid="lojista.rapido.camera" onClick={() => { onChange((c) => [...c, { key: `k${c.length}`, assetId: `a${c.length}`, previewUrl: 'blob:x', status: 'ready', progress: 100 } as never]); onAdded?.(); }}>fake-photo</button>
      <button type="button" onClick={() => onChange((c) => [...c, { key: `u${c.length}`, previewUrl: 'blob:x', status: 'uploading', progress: 60 } as never])}>fake-uploading</button>
      <button type="button" onClick={() => onChange((c) => (c as { status: string }[]).map((p) => (p.status === 'uploading' ? { ...p, status: 'ready', progress: 100, assetId: 'a-up' } : p)) as never[])}>finish-upload</button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ),
}));

const categories = {
  data: [
    {
      id: 'c1', parentId: null, name: 'Roupas', icon: 'tshirt', position: 0, active: true, createdAt: '', updatedAt: '',
      children: [
        { id: 'c2', parentId: 'c1', name: 'Camisetas', icon: 'x', position: 0, active: true, createdAt: '', updatedAt: '' },
        { id: 'c3', parentId: 'c1', name: 'Cosméticos', icon: 'x', position: 1, active: true, createdAt: '', updatedAt: '' },
        { id: 'c4', parentId: 'c1', name: 'Calçados', icon: 'x', position: 2, active: true, createdAt: '', updatedAt: '' },
      ],
    },
  ],
  nextCursor: null,
};
const templates = {
  data: [
    { categoryId: 'c2', attributes: [{ name: 'Tamanho', values: ['P', 'M', 'G', 'GG'] }, { name: 'Cor', values: ['Preto', 'Branco'] }], sizeChartHint: true, noVoluntaryExchangeHint: false, descriptionRequired: false, descriptionMinChars: 20 },
    { categoryId: 'c3', attributes: [{ name: 'Volume (ml)', values: [] }], sizeChartHint: false, noVoluntaryExchangeHint: true, descriptionRequired: true, descriptionMinChars: 20 },
    { categoryId: 'c4', attributes: [{ name: 'Tamanho', values: ['34', '36', '38', '40', '42', '44'] }, { name: 'Cor', values: [] }], sizeChartHint: true, noVoluntaryExchangeHint: false, descriptionRequired: false, descriptionMinChars: 20 },
  ],
  nextCursor: null,
};
const quickStart = (over = {}) => ({ suggestedCategoryId: 'c2', draftCount: 1, draftLimit: 100, latestDraft: null, withoutDescriptionCount: 0, limits: { variantsMax: 100, reajusteMaxPct: 30 }, ...over });
const baseProduct = (over = {}) => ({
  id: 'p1', name: '', description: null, categoryId: null, sectionId: null, status: 'draft', moderationStatus: 'ok', moderationReason: null, basePriceCents: null,
  promotion: { priceCents: null, startsAt: null, endsAt: null, active: false }, variantAttributes: [], variants: [], images: [], soldOut: false, publishedAt: null, createdAt: '', updatedAt: '2026-11-22T17:00:00Z', version: 1, via: 'camera', ...over,
});

type Handler = Parameters<typeof mockFetch>[0];
interface World {
  product: ReturnType<typeof baseProduct>;
  quick: (() => Response | Promise<Response>)[];
  patch: (() => Response | Promise<Response>) | null;
  start: ReturnType<typeof quickStart>;
}
let world: World;
const P = '/api/proxy/lojista/stores/s1';

function setup(extra: Handler[] = []) {
  return mockFetch(
    ...extra,
    (url, init) => {
      if (url.pathname === `${P}/products/p1` && (init.method ?? 'GET') === 'GET') return json(world.product);
      if (url.pathname === `${P}/products/p1` && init.method === 'PATCH') {
        if (world.patch) return world.patch();
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        world.product = { ...world.product, ...body, version: (world.product.version ?? 1) + 1 } as never;
        return json(world.product);
      }
      if (url.pathname === `${P}/products/p1/images`) {
        world.product = { ...world.product, version: (world.product.version ?? 1) + 1 };
        return json(world.product);
      }
      if (url.pathname === `${P}/products/p1/quick-publish`) {
        const next = world.quick.shift();
        return next ? next() : json({ ...world.product, status: 'active' });
      }
      return undefined;
    },
    (url) => (url.pathname === `${P}/catalog/quick-start` ? json(world.start) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/category-templates' ? json(templates) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/categories' ? json(categories) : undefined),
    ...storeHandlers(fakeStore({ status: 'approved', step: 4, commissionPct: 10 })),
  );
}

const callsTo = (calls: { url: URL; init: RequestInit }[], suffix: string, method = 'POST') => calls.filter((c) => c.url.pathname.endsWith(suffix) && c.init.method === method);
const header = (call: { init: RequestInit } | undefined, name: string) => (call?.init.headers as Record<string, string> | undefined)?.[name];
const active = (over = {}) => ({ ...baseProduct({ name: 'Camiseta básica preta', basePriceCents: 4990, categoryId: 'c2' }), status: 'active', version: 2, ...over });

async function fillBasics(user: ReturnType<typeof userEvent.setup>, name = 'Camiseta básica preta', price = '4990') {
  await user.click(await screen.findByText('fake-photo'));
  await user.type(await screen.findByTestId('lojista.rapido.name'), name);
  await user.type(screen.getByTestId('lojista.rapido.price'), price);
}

const online = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    // O gerenciador do TanStack é global e só ouve o evento enquanto há consulta montada: acerta o estado à mão.
    onlineManager.setOnline(value);
  });
};

beforeEach(() => {
  world = { product: baseProduct(), quick: [], patch: null, start: quickStart() };
  push.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  online(true);
  timing.sleep = async () => undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
  timing.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  timing.now = () => Date.now();
});

describe('Cadastro rápido: publicar em 2 campos (WB-370)', () => {
  it('C5: "Publicar" vazio mostra o erro em cada campo, não desabilita o botão e não chama a API', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    const publish = await screen.findByTestId('lojista.rapido.publish');
    expect(publish).not.toBeDisabled();
    await userEvent.click(publish);
    expect(await screen.findByText('Escreva o nome do produto.')).toBeInTheDocument();
    expect(screen.getByText('Informe o preço, ex.: 49,90.')).toBeInTheDocument();
    expect(screen.getByText('Falta a foto. Tire uma foto do produto.')).toBeInTheDocument();
    expect(callsTo(calls, '/quick-publish')).toHaveLength(0);
    expect(publish).not.toBeDisabled();
  });

  it('C3: nome, preço e foto publicam numa chamada só, com Idempotency-Key, If-Match e quantidade 1; mostra "Publicado" com as duas ações', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    const quick = callsTo(calls, '/quick-publish');
    expect(quick).toHaveLength(1);
    expect(JSON.parse(String(quick[0]?.init.body))).toEqual({ name: 'Camiseta básica preta', basePriceCents: 4990, categoryId: 'c2', stock: 1, imageIds: ['a0'] });
    expect(header(quick[0], 'idempotency-key')).toMatch(/^qp-[A-Za-z0-9_-]{8,}$/);
    expect(header(quick[0], 'if-match')).toMatch(/^"\d+"$/);
    expect(screen.getByRole('heading', { name: 'Publicado' })).toBeInTheDocument();
    expect(screen.getByTestId('lojista.rapido.another')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.rapido.duplicate')).toBeInTheDocument();
    expect(screen.getByText(/Já aparece na sua loja/)).toBeInTheDocument();
  });

  it('WB-379 C1: o front só informa a via; a publicação não leva texto de medição, id de sessão nem evento próprio', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    await screen.findByTestId('lojista.rapido.published');
    for (const call of calls) {
      const headers = Object.keys((call.init.headers as Record<string, string> | undefined) ?? {}).join(' ').toLowerCase();
      expect(headers).not.toContain('session');
      expect(call.url.pathname).not.toMatch(/analytics|events|metrics/);
    }
    expect(callsTo(calls, '/quick-publish')).toHaveLength(1);
  });

  it('C2: depois da foto o foco vai para o Nome', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await userEvent.click(await screen.findByText('fake-photo'));
    await waitFor(() => expect(screen.getByTestId('lojista.rapido.name')).toHaveFocus());
  });

  it('teclado: "Próximo" leva do nome ao preço e do preço à quantidade, e o botão Publicar é alcançável por Tab', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await user.type(await screen.findByTestId('lojista.rapido.name'), 'Camiseta{Enter}');
    expect(screen.getByTestId('lojista.rapido.price')).toHaveFocus();
    expect(screen.getByTestId('lojista.rapido.price')).toHaveAttribute('inputmode', 'decimal');
    await user.type(screen.getByTestId('lojista.rapido.price'), '4990{Enter}');
    expect(screen.getByTestId('lojista.rapido.stock')).toHaveFocus();
    expect(screen.getByTestId('lojista.rapido.stock')).toHaveAttribute('inputmode', 'numeric');
  });

  it('C4: a categoria vem sugerida pela última usada e dá para trocar', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    const select = (await screen.findByTestId('lojista.rapido.category')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('c2'));
    expect(screen.getByText('A última que você usou. Toque para trocar.')).toBeInTheDocument();
    await userEvent.selectOptions(select, 'c4');
    expect(select.value).toBe('c4');
  });

  it('C10: mostra "Você recebe cerca de" enquanto digita o preço', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await userEvent.type(await screen.findByTestId('lojista.rapido.price'), '10000');
    const hint = await screen.findByTestId('lojista.rapido.earnings');
    await waitFor(() => expect(hint).toHaveTextContent(/Você recebe cerca de\s*R\$\s*90,00/));
    expect(hint).toHaveAttribute('role', 'status');
  });

  it('C6: foto ainda subindo no aparelho mostra "Enviando a foto… 60%" e publica sozinho ao terminar, sem perder o que digitou', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await user.click(await screen.findByText('fake-uploading'));
    await user.type(await screen.findByTestId('lojista.rapido.name'), 'Bermuda jeans');
    await user.type(screen.getByTestId('lojista.rapido.price'), '7990');
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByText('Enviando a foto… 60%')).toBeInTheDocument();
    expect(callsTo(calls, '/quick-publish')).toHaveLength(0);
    await user.click(screen.getByText('finish-upload'));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    expect(JSON.parse(String(callsTo(calls, '/quick-publish')[0]?.init.body)).imageIds).toEqual(['a-up']);
  });

  it('C6: UPLOAD_NOT_READY não mostra erro: repete com a mesma chave e publica', async () => {
    const notReady = () => json({ code: 'UPLOAD_NOT_READY', title: 'Foto em processamento', status: 422 }, 422);
    world.quick = [notReady, notReady];
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    const quick = callsTo(calls, '/quick-publish');
    expect(quick).toHaveLength(3);
    expect(new Set(quick.map((c) => header(c, 'idempotency-key'))).size).toBe(1);
    expect(screen.queryByTestId('lojista.rapido.publish-error')).not.toBeInTheDocument();
  });

  it('C6: passados 30 s mostra "A foto está demorando. Tente publicar de novo." e nada se perde; publicar de novo usa a mesma chave', async () => {
    let clock = 0;
    timing.now = () => clock;
    timing.sleep = async (ms) => {
      clock += ms + 10_000;
    };
    const notReady = () => json({ code: 'UPLOAD_NOT_READY', title: 'Foto em processamento', status: 422 }, 422);
    world.quick = [notReady, notReady, notReady, notReady, notReady];
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByText('A foto está demorando. Tente publicar de novo.')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.rapido.name')).toHaveValue('Camiseta básica preta');
    world.quick = [];
    clock = 0;
    await user.click(screen.getByRole('button', { name: 'Publicar de novo' }));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    const keys = new Set(callsTo(calls, '/quick-publish').map((c) => header(c, 'idempotency-key')));
    expect(keys.size).toBe(1);
  });

  it('C14: duplo toque em "Publicar" publica uma só vez', async () => {
    let release: (() => void) | null = null;
    world.quick = [
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json({ ...world.product, status: 'active' }));
        }),
    ];
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    const publish = screen.getByTestId('lojista.rapido.publish');
    await user.click(publish);
    await user.click(publish);
    await waitFor(() => expect(callsTo(calls, '/quick-publish')).toHaveLength(1));
    expect(publish).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      (release as (() => void) | null)?.();
    });
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    expect(callsTo(calls, '/quick-publish')).toHaveLength(1);
  });

  it('C15: resposta perdida; no 2º toque o 409 reconsulta o produto e, ATIVO com os mesmos dados, mostra "Publicado" sem erro', async () => {
    let first = true;
    const lost = () => {
      first = false;
      throw new TypeError('Failed to fetch');
    };
    world.quick = [lost, () => json({ code: 'PRODUCT_VERSION_CONFLICT', title: 'Conflito', status: 409 }, 409)];
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByText('Não recebemos a confirmação. Toque em Publicar de novo: não vai duplicar.')).toBeInTheDocument();
    expect(first).toBe(false);
    world.product = active({ version: 3 });
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    expect(screen.queryByText(/conflito/i)).not.toBeInTheDocument();
    const quick = callsTo(calls, '/quick-publish');
    expect(quick).toHaveLength(2);
    expect(header(quick[0], 'idempotency-key')).toBe(header(quick[1], 'idempotency-key'));
  });

  it('C16: produto já ATIVO com outros dados mostra "Este produto já está publicado" com "Ver produto"', async () => {
    world.quick = [() => json({ code: 'QUICK_PUBLISH_NOT_APPLICABLE', title: 'Já publicado', status: 409 }, 409)];
    const { impl } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    // O servidor já tem outro produto ATIVO: o autosave não pode "consertar" o nome e o preço no mock.
    world.patch = () => json(world.product);
    world.product = active({ name: 'Outro nome', basePriceCents: 9990 });
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    const box = await screen.findByTestId('lojista.rapido.publish-error');
    expect(box).toHaveTextContent('Este produto já está publicado.');
    expect(within(box).getByRole('link', { name: 'Ver produto' })).toHaveAttribute('href', '/lojista/produtos/p1');
  });

  it('C16: 422 QUICK_PUBLISH_NOT_APPLICABLE (rascunho com grade) segue pelo caminho da grade, sem erro técnico', async () => {
    world.quick = [() => json({ code: 'QUICK_PUBLISH_NOT_APPLICABLE', title: 'Tem grade', status: 422 }, 422)];
    const { impl, calls } = setup([
      (url, init) => (url.pathname === `${P}/products/p1/variants` && init.method === 'PUT' ? json(world.product) : undefined),
      (url, init) => (url.pathname === `${P}/products/p1/publish` && init.method === 'POST' ? json({ ...world.product, status: 'active' }) : undefined),
    ]);
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    expect(callsTo(calls, '/products/p1', 'PATCH').length).toBeGreaterThan(0);
    expect(callsTo(calls, '/publish')).toHaveLength(1);
    expect(screen.queryByText(/QUICK_PUBLISH/)).not.toBeInTheDocument();
  });

  it('C17: categoria proibida volta o erro no campo certo, com o link dos Termos, e o produto continua rascunho', async () => {
    world.quick = [() => json({ code: 'CATEGORY_FORBIDDEN', title: 'Proibida', status: 422 }, 422)];
    vi.stubGlobal('fetch', setup().impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByText('Esse tipo de produto não é permitido no Webag.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o que não pode ser vendido' })).toBeInTheDocument();
    expect(screen.getByTestId('lojista.rapido.name')).toHaveValue('Camiseta básica preta');
    expect(screen.queryByTestId('lojista.rapido.published')).not.toBeInTheDocument();
  });

  it('C17: preço fora da faixa devolvido pelo servidor aparece no campo do preço', async () => {
    world.quick = [() => json({ code: 'PRICE_OUT_OF_RANGE', title: 'Preço', status: 422 }, 422)];
    vi.stubGlobal('fetch', setup().impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByText('O preço máximo é R$ 99.999,99.')).toBeInTheDocument();
  });

  it('C13: categoria com descrição obrigatória e texto curto mostra o erro no campo e não envia', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user, 'Perfume 100 ml');
    await user.selectOptions(screen.getByTestId('lojista.rapido.category'), 'c3');
    await user.type(await screen.findByTestId('lojista.rapido.description'), 'curto');
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findAllByText('Escreva ao menos 20 caracteres sobre o produto.')).not.toHaveLength(0);
    expect(callsTo(calls, '/quick-publish')).toHaveLength(0);
    expect(screen.getByTestId('lojista.rapido.name')).toHaveValue('Perfume 100 ml');
  });
});

describe('Sem rede (DEC-126: sem fila offline)', () => {
  it('C8: sem internet "Publicar" fica inerte com o motivo escrito, nada é enviado e nada é enviado sozinho ao voltar; ao tocar de novo publica uma vez', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    online(false);
    const publish = screen.getByTestId('lojista.rapido.publish');
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).not.toBeDisabled();
    expect(screen.getByTestId('lojista.rapido.offline-banner')).toHaveTextContent('Sem internet. O que você digitou fica neste aparelho; publique quando voltar');
    await user.click(publish);
    expect(await screen.findByTestId('lojista.rapido.offline-tap')).toHaveTextContent('Sem internet. Conecte para publicar.');
    expect(callsTo(calls, '/quick-publish')).toHaveLength(0);
    online(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callsTo(calls, '/quick-publish')).toHaveLength(0);
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    expect(callsTo(calls, '/quick-publish')).toHaveLength(1);
  });

  it('sem internet "Guardar rascunho" também fica inerte com o motivo', async () => {
    const { impl } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await screen.findByTestId('lojista.rapido.form');
    online(false);
    await userEvent.click(screen.getByTestId('lojista.rapido.save-draft'));
    expect(await screen.findByTestId('lojista.rapido.save-note')).toHaveTextContent('Sem internet. Conecte para guardar.');
  });
});

describe('Rascunho automático e cópia local (WB-371)', () => {
  it('C1: salva o nome no servidor com If-Match e só então diz "Salvo"; antes disso diz que está neste aparelho', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await userEvent.type(await screen.findByTestId('lojista.rapido.name'), 'Camiseta básica preta');
    expect(screen.getByTestId('lojista.rapido.strip')).toHaveTextContent('Salvo neste aparelho');
    await waitFor(() => expect(callsTo(calls, '/products/p1', 'PATCH').length).toBeGreaterThan(0), { timeout: 3000 });
    const patch = callsTo(calls, '/products/p1', 'PATCH')[0];
    expect(JSON.parse(String(patch?.init.body)).name).toBe('Camiseta básica preta');
    expect(header(patch, 'if-match')).toBe('"1"');
    await waitFor(() => expect(screen.getByTestId('lojista.rapido.strip')).toHaveTextContent(/^Salvo/), { timeout: 3000 });
    expect(screen.getByTestId('lojista.rapido.strip')).not.toHaveTextContent('neste aparelho');
  });

  it('C4: salvar quando o rascunho mudou em outro aparelho (409) pergunta qual versão manter', async () => {
    world.patch = () => {
      world.patch = null;
      world.product = baseProduct({ name: 'Camiseta (outro aparelho)', basePriceCents: 3990, version: 5, updatedAt: '2026-11-22T17:10:00Z' });
      return json({ code: 'PRODUCT_VERSION_CONFLICT', title: 'Conflito', status: 409 }, 409);
    };
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await userEvent.type(await screen.findByTestId('lojista.rapido.name'), 'Camiseta deste aparelho');
    const dialog = await screen.findByTestId('lojista.rapido.conflict', undefined, { timeout: 4000 });
    expect(dialog).toHaveTextContent('Camiseta (outro aparelho)');
    expect(dialog).toHaveTextContent('Camiseta deste aparelho');
    await userEvent.click(screen.getByTestId('lojista.rapido.conflict-mine'));
    await waitFor(() => expect(callsTo(calls, '/products/p1', 'PATCH')).toHaveLength(2), { timeout: 3000 });
    expect(header(callsTo(calls, '/products/p1', 'PATCH')[1], 'if-match')).toBe('"5"');
  });

  it('C4: "Usar a do outro aparelho" troca os campos pelos do servidor', async () => {
    world.patch = () => {
      world.patch = null;
      world.product = baseProduct({ name: 'Do outro aparelho', basePriceCents: 3990, version: 5 });
      return json({ code: 'PRODUCT_VERSION_CONFLICT', title: 'Conflito', status: 409 }, 409);
    };
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await userEvent.type(await screen.findByTestId('lojista.rapido.name'), 'Deste aparelho');
    await screen.findByTestId('lojista.rapido.conflict', undefined, { timeout: 4000 });
    await userEvent.click(screen.getByTestId('lojista.rapido.conflict-theirs'));
    await waitFor(() => expect(screen.getByTestId('lojista.rapido.name')).toHaveValue('Do outro aparelho'));
  });

  it('C8: depois de recarregar a aba, o formulário reaparece com o que estava na cópia local (e o aviso de recuperado)', async () => {
    writeQuickCopy('u1', 's1', 'p1', { name: 'Vestido floral', priceCents: 12990, stockText: '3', categoryId: 'c2', description: '', imageIds: [], unsent: true });
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    expect(await screen.findByTestId('lojista.rapido.name')).toHaveValue('Vestido floral');
    expect(screen.getByTestId('lojista.rapido.price')).toHaveValue('129,90');
    expect(screen.getByTestId('lojista.rapido.stock')).toHaveValue('3');
    expect(screen.getByTestId('lojista.rapido.recovered')).toBeInTheDocument();
  });

  it('C7: a cópia local de outro usuário do mesmo navegador não aparece', async () => {
    writeQuickCopy('outro-usuario', 's1', 'p1', { name: 'Segredo do outro', priceCents: 100, stockText: '1', categoryId: '', description: '', imageIds: [], unsent: true });
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    expect(await screen.findByTestId('lojista.rapido.name')).toHaveValue('');
  });

  it('produto que já está publicado não abre o formulário rápido', async () => {
    world.product = active();
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    expect(await screen.findByText('Este produto já está publicado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver produto' })).toBeInTheDocument();
  });
});

describe('Grade tamanho x cor e modelos (WB-374, WB-375)', () => {
  async function openGrade(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByTestId('lojista.rapido.grade-toggle'));
  }

  it('WB-375 C1/C2: o modelo da categoria traz os chips de tamanho, nenhum marcado, e lembra a tabela de medidas', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await openGrade(user);
    await waitFor(() => expect(screen.getByTestId('lojista.rapido.size-chart-hint')).toBeInTheDocument());
    for (const size of ['p', 'm', 'g', 'gg']) expect(screen.getByTestId(`lojista.rapido.chip-tamanho-${size}`)).toHaveAttribute('aria-pressed', 'false');
    await user.selectOptions(screen.getByTestId('lojista.rapido.category'), 'c4');
    expect(await screen.findByTestId('lojista.rapido.chip-tamanho-34')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.rapido.chip-tamanho-44')).toBeInTheDocument();
  });

  it('WB-374 C1/C2: P, M e G com preto e branco dão 6 combinações; "Preencher todos com 3" dá 18 unidades', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await openGrade(user);
    for (const id of ['tamanho-p', 'tamanho-m', 'tamanho-g', 'cor-preto', 'cor-branco']) await user.click(await screen.findByTestId(`lojista.rapido.chip-${id}`));
    expect(screen.getByTestId('lojista.rapido.grade-total')).toHaveTextContent('6 combinações · 0 unidades');
    const fill = screen.getByTestId('lojista.rapido.fill-value');
    await user.clear(fill);
    await user.type(fill, '3');
    await user.click(screen.getByTestId('lojista.rapido.fill-apply'));
    expect(screen.getByTestId('lojista.rapido.grade-total')).toHaveTextContent('6 combinações · 18 unidades');
    expect(screen.getByTestId('lojista.rapido.stock-total')).toHaveTextContent('18 unidades no total');
    expect(screen.getByLabelText('Estoque de P · Preto')).toHaveValue('3');
    expect(screen.getByTestId('lojista.rapido.grade-total')).toHaveAttribute('aria-live', 'polite');
  });

  it('WB-374 C3: acima do limite recusa com o limite e o que fazer', async () => {
    world.start = quickStart({ limits: { variantsMax: 4, reajusteMaxPct: 30 } });
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await openGrade(user);
    for (const id of ['tamanho-p', 'tamanho-m', 'tamanho-g', 'cor-preto', 'cor-branco']) await user.click(await screen.findByTestId(`lojista.rapido.chip-${id}`));
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect((await screen.findAllByText('Máximo de 4 combinações. Tire alguma opção.')).length).toBeGreaterThan(0);
    expect(callsTo(calls, '/quick-publish')).toHaveLength(0);
  });

  it('WB-374 C4: valor repetido diz "Essa combinação já existe"', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await openGrade(user);
    await user.click(await screen.findByTestId('lojista.rapido.chip-cor-preto'));
    await user.type(screen.getByTestId('lojista.rapido.custom-cor'), 'preto');
    await user.click(screen.getByTestId('lojista.rapido.custom-cor-add'));
    expect(await screen.findByText('Essa combinação já existe')).toBeInTheDocument();
  });

  it('WB-374 C7 / C16: com grade preenchida o "Publicar" grava as combinações e publica pelo caminho da grade, sem a chamada rápida', async () => {
    const { impl, calls } = setup([
      (url, init) => (url.pathname === `${P}/products/p1/variants` && init.method === 'PUT' ? json(world.product) : undefined),
      (url, init) => (url.pathname === `${P}/products/p1/publish` && init.method === 'POST' ? json({ ...world.product, status: 'active' }) : undefined),
    ]);
    vi.stubGlobal('fetch', impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await fillBasics(user);
    await openGrade(user);
    for (const id of ['tamanho-m', 'tamanho-g']) await user.click(await screen.findByTestId(`lojista.rapido.chip-${id}`));
    await user.type(screen.getByLabelText('Estoque de M'), '2');
    await user.click(screen.getByTestId('lojista.rapido.publish'));
    expect(await screen.findByTestId('lojista.rapido.published')).toBeInTheDocument();
    expect(callsTo(calls, '/quick-publish')).toHaveLength(0);
    const variants = callsTo(calls, '/variants', 'PUT')[0];
    const body = JSON.parse(String(variants?.init.body)) as { attributes: string[]; variants: { attributes: Record<string, string>; stock: number }[] };
    expect(body.attributes).toEqual(['Tamanho']);
    expect(body.variants.map((v) => v.stock)).toEqual([2, 0]);
  });

  it('WB-375 C3: categoria de higiene sugere "Não aceita troca por tamanho ou cor", sem marcar sozinha (C4: nada é obrigatório)', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const user = userEvent.setup();
    renderLojista(<QuickProductPage productId="p1" autoCamera={false} />);
    await user.selectOptions(await screen.findByTestId('lojista.rapido.category'), 'c3');
    const box = await screen.findByLabelText(/Não aceita troca por tamanho ou cor/);
    expect(box).not.toBeChecked();
  });
});
