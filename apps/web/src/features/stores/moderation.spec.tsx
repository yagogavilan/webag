import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminProduct } from '@/lib/api/admin-moderation';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { ModerationPage } from './moderation-page';
import { ModerationRulesPage } from './moderation-rules-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/admin/moderacao' }));

const product = (over: Partial<AdminProduct> = {}): AdminProduct => ({
  id: 'p1',
  name: 'Camiseta Réplica',
  description: 'Igual à original',
  storeId: 's1',
  storeName: 'Casa Bela',
  categoryId: 'c1',
  status: 'active',
  moderationStatus: 'review',
  moderationReason: 'Palavra suspeita: réplica',
  moderatedAt: null,
  basePriceCents: 4990,
  createdAt: '2026-11-17T12:00:00Z',
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('ModerationPage (A4)', () => {
  const server = (rows: AdminProduct[], result: object = { id: 'p1', moderationStatus: 'ok', storeFlagged: false }) =>
    mockFetch(
      (url) => (path(url) === 'admin/products' ? json({ data: rows, nextCursor: null }) : undefined),
      (url) => (path(url) === 'admin/categories' ? json({ data: [{ id: 'c1', name: 'Moda', children: [] }], nextCursor: null, icons: [] }) : undefined),
      (url, init) => (path(url) === 'admin/products/p1/moderation' && init.method === 'POST' ? json(result) : undefined),
    );
  const sent = (calls: { url: URL; init: RequestInit }[]) => calls.filter((c) => path(c.url) === 'admin/products/p1/moderation').map((c) => JSON.parse(String(c.init.body)));

  it('lista a fila Revisar com a contagem, o sinal e o nome da categoria', async () => {
    const { impl, calls } = server([product()]);
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationPage />, 'operations');
    const row = await screen.findByTestId('admin.moderacao.row-p1');
    expect(row).toHaveTextContent('Palavra suspeita: réplica');
    await waitFor(() => expect(row).toHaveTextContent('Moda'));
    await waitFor(() => expect(screen.getByTestId('admin.moderacao.tab-review')).toHaveTextContent('Revisar (1)'));
    expect(calls.find((c) => path(c.url) === 'admin/products')!.url.searchParams.get('moderationStatus')).toBe('review');
    await userEvent.click(screen.getByTestId('admin.moderacao.tab-all'));
    await waitFor(() => expect(calls.some((c) => path(c.url) === 'admin/products' && !c.url.searchParams.has('moderationStatus'))).toBe(true));
  });

  it('abre o produto e mantém no ar (restore)', async () => {
    const { impl, calls } = server([product()]);
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationPage />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.moderacao.row-p1-open'));
    expect(screen.getByTestId('admin.moderacao.signal')).toHaveTextContent('Palavra suspeita: réplica');
    await userEvent.click(screen.getByTestId('admin.moderacao.keep'));
    expect(await screen.findByText('Produto mantido no ar.')).toBeInTheDocument();
    expect(sent(calls)).toEqual([{ action: 'restore' }]);
  });

  it('remover exige motivo, confirma e avisa a reincidência quando a loja foi sinalizada', async () => {
    const { impl, calls } = server([product()], { id: 'p1', moderationStatus: 'removed', storeFlagged: true });
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationPage />, 'super_admin');
    await userEvent.click(await screen.findByTestId('admin.moderacao.row-p1-open'));
    await userEvent.click(screen.getByTestId('admin.moderacao.remove'));
    expect(screen.getByText('Remover Camiseta Réplica?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.moderacao.remove-confirm'));
    expect(sent(calls)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Produto proibido' }));
    await userEvent.click(screen.getByTestId('admin.moderacao.remove-confirm'));
    expect(await screen.findByText('Produto removido. O lojista foi avisado.')).toBeInTheDocument();
    expect(sent(calls)).toEqual([{ action: 'remove', reason: 'Produto proibido' }]);
    expect(screen.getByTestId('admin.moderacao.repeat-offender')).toHaveTextContent('Casa Bela teve 3 remoções em 30 dias.');
    expect(screen.getByTestId('admin.moderacao.analyze-suspension')).toHaveAttribute('href', '/admin/lojas/s1');
  });

  it('pausar manda o motivo', async () => {
    const { impl, calls } = server([product()], { id: 'p1', moderationStatus: 'paused', storeFlagged: false });
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationPage />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.moderacao.row-p1-open'));
    await userEvent.click(screen.getByTestId('admin.moderacao.pause'));
    await userEvent.click(screen.getByRole('button', { name: 'Descrição enganosa' }));
    await userEvent.click(screen.getByTestId('admin.moderacao.pause-confirm'));
    expect(await screen.findByText('Produto pausado.')).toBeInTheDocument();
    expect(sent(calls)).toEqual([{ action: 'pause', reason: 'Descrição enganosa' }]);
  });

  it('produto removido só pode ser restaurado', async () => {
    vi.stubGlobal('fetch', server([product({ moderationStatus: 'removed', moderationReason: 'Produto proibido' })]).impl);
    renderPanel(<ModerationPage />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.moderacao.row-p1-open'));
    expect(screen.getByTestId('admin.moderacao.keep')).toHaveTextContent('Restaurar produto');
    expect(screen.getByTestId('admin.moderacao.remove')).toBeDisabled();
    expect(screen.getByTestId('admin.moderacao.pause')).toBeDisabled();
  });

  it('vazio oferece ver todos; suporte só lê e não vê as regras', async () => {
    vi.stubGlobal('fetch', server([]).impl);
    const view = renderPanel(<ModerationPage />, 'operations');
    expect(await screen.findByText('Nada para revisar')).toBeInTheDocument();
    view.unmount();
    vi.stubGlobal('fetch', server([product()]).impl);
    renderPanel(<ModerationPage />, 'support');
    await userEvent.click(await screen.findByTestId('admin.moderacao.row-p1-open'));
    expect(screen.getByText('Você pode ver este produto, mas não moderar.')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.moderacao.keep')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin.moderacao.rules-link')).not.toBeInTheDocument();
  });

  it('erro ao carregar mostra tentar de novo', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/products' ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined)).impl);
    renderPanel(<ModerationPage />, 'operations');
    expect(await screen.findByText('Não conseguimos carregar agora')).toBeInTheDocument();
  });
});

describe('ModerationRulesPage', () => {
  it('adiciona e remove palavra suspeita pelo contrato de termos', async () => {
    const { impl, calls } = mockFetch(
      (url, init) => (path(url) === 'admin/moderation/terms' && (init.method ?? 'GET') === 'GET' ? json({ data: [{ id: 'w1', kind: 'suspect_word', value: 'replica', label: 'réplica', createdAt: '2026-11-01T00:00:00Z' }, { id: 'k1', kind: 'forbidden_category', value: 'c9', label: 'Armas', createdAt: '2026-11-01T00:00:00Z' }], nextCursor: null }) : undefined),
      (url) => (path(url) === 'admin/categories' ? json({ data: [{ id: 'c9', name: 'Armas', children: [] }, { id: 'c1', name: 'Moda', children: [] }], nextCursor: null, icons: [] }) : undefined),
      (url, init) => (path(url) === 'admin/moderation/terms' && init.method === 'POST' ? json({ id: 'w2', kind: 'suspect_word', value: 'falsificado', label: 'falsificado', createdAt: '' }, 201) : undefined),
      (url) => (path(url) === 'admin/moderation/terms/w1' ? json(null, 204) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationRulesPage />, 'operations');
    expect(await screen.findByText('réplica')).toBeInTheDocument();
    expect(screen.getByText('Armas', { selector: 'span' })).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.moderacao.rule-word-input'), 'muito falso');
    await userEvent.click(screen.getByTestId('admin.moderacao.rule-word-add'));
    expect(await screen.findByText('Escreva uma palavra só. Para várias, adicione uma de cada vez.')).toBeInTheDocument();
    await userEvent.clear(screen.getByTestId('admin.moderacao.rule-word-input'));
    await userEvent.type(screen.getByTestId('admin.moderacao.rule-word-input'), 'falsificado');
    await userEvent.click(screen.getByTestId('admin.moderacao.rule-word-add'));
    await waitFor(() => expect(JSON.parse(String(calls.find((c) => c.init.method === 'POST')!.init.body))).toEqual({ kind: 'suspect_word', value: 'falsificado' }));
    await userEvent.click(screen.getByTestId('admin.moderacao.rule-word-w1-remove'));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'DELETE')).toBe(true));
  });

  it('suporte não tem acesso às regras', async () => {
    vi.stubGlobal('fetch', mockFetch().impl);
    renderPanel(<ModerationRulesPage />, 'support');
    expect(await screen.findByText('Você não tem acesso a essa área')).toBeInTheDocument();
  });
});
