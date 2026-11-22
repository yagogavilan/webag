import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '@/lib/api/catalog';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ProductsPage } from './products-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/produtos' }));

const summary = (id: string, name: string, basePriceCents: number): ProductSummary => ({
  id,
  name,
  status: 'active',
  moderationStatus: 'ok',
  sectionId: null,
  basePriceCents,
  fromPriceCents: basePriceCents,
  cover: null,
  availableTotal: 5,
  low: false,
  soldOut: false,
  variantCount: 1,
  updatedAt: '2026-11-18T12:00:00.000Z',
});

interface BulkBody {
  productIds: string[];
  dryRun?: boolean;
  confirmLargeChange?: boolean;
  expectedVersions?: { productId: string; version: number }[];
  action: { type: string; value?: number };
}

/** Servidor falso do `bulkProducts`: versões mudam a cada `bumpVersions`, como se outra pessoa tivesse editado. */
function bulkServer(opts: { exceeds?: boolean } = {}) {
  const state = { version: 3, dry: [] as BulkBody[], apply: [] as { body: BulkBody; key: string | null }[], failNext: [] as (() => Response | Error)[] };
  const handler = (url: URL, init: RequestInit): Response | undefined => {
    if (!url.pathname.endsWith('/products/bulk') || init.method !== 'POST') return undefined;
    const body = JSON.parse(String(init.body)) as BulkBody;
    const key = (init.headers as Record<string, string>)['idempotency-key'] ?? null;
    if (body.dryRun) {
      state.dry.push(body);
      return json({
        dryRun: true,
        willChange: body.productIds.length,
        changed: 0,
        blocked: [],
        requiresConfirmation: opts.exceeds === true,
        batchId: null,
        undoUntil: null,
        preview: body.productIds.map((id) => ({ productId: id, name: id === 'p1' ? 'Camiseta Básica' : 'Boné', version: state.version, fromCents: 5000, toCents: 5500, changePct: 10, youReceiveCents: 4800, exceedsLimit: opts.exceeds === true })),
      });
    }
    state.apply.push({ body, key });
    const fail = state.failNext.shift();
    if (fail) {
      const out = fail();
      if (out instanceof Error) throw out;
      return out;
    }
    return json({ dryRun: false, willChange: body.productIds.length, changed: body.productIds.length, blocked: [], batchId: 'b1', undoUntil: '2026-11-22T12:10:00.000Z' });
  };
  return { state, handler };
}

function boot(server: ReturnType<typeof bulkServer>) {
  const store = fakeStore({ status: 'approved', step: 4 });
  const products = [summary('p1', 'Camiseta Básica', 5000), summary('p2', 'Boné', 5000)];
  const { impl, calls } = mockFetch(
    server.handler,
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/products' ? json({ data: products, nextCursor: null }) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/sections' ? json({ data: [], nextCursor: null }) : undefined),
    ...storeHandlers(store),
  );
  vi.stubGlobal('fetch', impl);
  return calls;
}

async function openPrice(value = '10') {
  renderLojista(<ProductsPage />);
  await userEvent.click(await screen.findByTestId('lojista.produtos.select-p1'));
  await userEvent.click(screen.getByTestId('lojista.produtos.select-p2'));
  await userEvent.click(screen.getByTestId('lojista.produtos.bulk-price'));
  await userEvent.type(screen.getByTestId('lojista.produtos.bulk-value'), value);
  await screen.findByText('2 produtos serão alterados.', undefined, { timeout: 3000 });
}

const confirm = () => screen.getByTestId('lojista.produtos.bulk-confirm');
afterEach(() => vi.unstubAllGlobals());

describe('Reajuste em massa: prévia, versões e Idempotency-Key (R1.2, tech-lead B2)', () => {
  it('prévia (dryRun, sem chave) e depois aplicar com chave e expectedVersions da prévia', async () => {
    const server = bulkServer();
    boot(server);
    await openPrice();
    expect(server.state.dry).toHaveLength(1);
    expect(server.state.dry[0]).toMatchObject({ dryRun: true, productIds: ['p1', 'p2'], action: { type: 'price_adjust', mode: 'percent', value: 10 } });
    expect(server.state.apply).toHaveLength(0);
    await userEvent.click(confirm());
    expect(await screen.findByText('2 produtos atualizados.')).toBeInTheDocument();
    expect(server.state.apply).toHaveLength(1);
    const { body, key } = server.state.apply[0]!;
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(body.dryRun).toBe(false);
    expect(body.expectedVersions).toEqual([{ productId: 'p1', version: 3 }, { productId: 'p2', version: 3 }]);
    expect(body.confirmLargeChange).toBeUndefined();
  });

  it('retentativa depois de rede ruim reaproveita a MESMA chave e o mesmo corpo', async () => {
    const server = bulkServer();
    boot(server);
    server.state.failNext.push(() => new TypeError('Failed to fetch'));
    await openPrice();
    await userEvent.click(confirm());
    expect(await screen.findByTestId('lojista.produtos.bulk-error')).toHaveTextContent('Conecte-se para salvar');
    await userEvent.click(confirm());
    expect(await screen.findByText('2 produtos atualizados.')).toBeInTheDocument();
    expect(server.state.apply).toHaveLength(2);
    expect(server.state.apply[1]!.key).toBe(server.state.apply[0]!.key);
    expect(server.state.apply[1]!.body).toEqual(server.state.apply[0]!.body);
  });

  it('409 BULK_VERSION_CONFLICT: explica, recarrega a prévia e a próxima tentativa usa versão e chave novas', async () => {
    const server = bulkServer();
    boot(server);
    server.state.failNext.push(() => {
      server.state.version = 4;
      return json({ type: 'x', title: 'Produtos alterados depois da prévia', status: 409, code: 'BULK_VERSION_CONFLICT', conflicts: [{ productId: 'p2', name: 'Boné', currentVersion: 4 }] }, 409);
    });
    await openPrice();
    await userEvent.click(confirm());
    expect(await screen.findByTestId('lojista.produtos.bulk-error')).toHaveTextContent('Boné mudou depois da prévia');
    expect(screen.getByTestId('lojista.produtos.bulk-error')).toHaveTextContent('Nada foi aplicado');
    await vi.waitFor(() => expect(server.state.dry).toHaveLength(2));
    await vi.waitFor(() => expect(confirm()).toBeEnabled());
    await userEvent.click(confirm());
    expect(await screen.findByText('2 produtos atualizados.')).toBeInTheDocument();
    expect(server.state.apply[1]!.body.expectedVersions).toEqual([{ productId: 'p1', version: 4 }, { productId: 'p2', version: 4 }]);
    expect(server.state.apply[1]!.key).not.toBe(server.state.apply[0]!.key);
  });

  it('IDEMPOTENCY_IN_PROGRESS: pede para esperar e a nova tentativa usa a mesma chave', async () => {
    const server = bulkServer();
    boot(server);
    server.state.failNext.push(() => json({ type: 'x', title: 'Em andamento', status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' }, 409));
    await openPrice();
    await userEvent.click(confirm());
    expect(await screen.findByTestId('lojista.produtos.bulk-error')).toHaveTextContent('ainda está sendo aplicada');
    await userEvent.click(confirm());
    expect(await screen.findByText('2 produtos atualizados.')).toBeInTheDocument();
    expect(server.state.apply[1]!.key).toBe(server.state.apply[0]!.key);
  });

  it('variação acima do limite: o botão só habilita com "Conferi os valores novos" e manda confirmLargeChange', async () => {
    const server = bulkServer({ exceeds: true });
    boot(server);
    await openPrice('50');
    expect(screen.getByTestId('lojista.produtos.bulk-large-change')).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Conferi os valores novos'));
    expect(confirm()).toBeEnabled();
    await userEvent.click(confirm());
    expect(await screen.findByText('2 produtos atualizados.')).toBeInTheDocument();
    expect(server.state.apply[0]!.body.confirmLargeChange).toBe(true);
  });

  it('pausar continua sem chave e sem expectedVersions (estado absoluto)', async () => {
    const server = bulkServer();
    boot(server);
    renderLojista(<ProductsPage />);
    await userEvent.click(await screen.findByTestId('lojista.produtos.select-p1'));
    await userEvent.click(screen.getByTestId('lojista.produtos.bulk-pause'));
    await userEvent.click(confirm());
    expect(await screen.findByText('1 produto atualizado.')).toBeInTheDocument();
    expect(server.state.apply[0]!.key).toBeNull();
    expect(server.state.apply[0]!.body.expectedVersions).toBeUndefined();
  });
});
