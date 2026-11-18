import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModerationRow } from '@/lib/api/admin-moderation';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { ModerationPage } from './moderation-page';
import { ModerationRulesPage } from './moderation-rules-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/admin/moderacao' }));

const product = (over: Partial<ModerationRow> = {}): ModerationRow => ({ id: 'p1', name: 'Camiseta Réplica', storeId: 's1', storeName: 'Casa Bela', category: 'Moda', priceCents: 4990, createdAt: '2026-11-17T12:00:00Z', signal: 'Palavra proibida: réplica', reports: 2, status: 'flagged', photoUrl: null, description: 'Igual à original', storeRemovals30d: 3, ...over });

afterEach(() => vi.unstubAllGlobals());

describe('ModerationPage (A4)', () => {
  const server = (rows: ModerationRow[]) =>
    mockFetch(
      (url) => (path(url) === 'admin/moderation/products' ? json({ data: rows, nextCursor: null, counts: { review: rows.length, reported: 0 } }) : undefined),
      (url) => (path(url) === 'admin/moderation/products/p1/keep' ? json(null, 204) : undefined),
      (url) => (path(url) === 'admin/moderation/products/p1/remove' ? json(null, 204) : undefined),
    );

  it('abre o produto, avisa da reincidência e mantém no ar', async () => {
    const { impl, calls } = server([product()]);
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationPage />, 'operations');
    await screen.findByTestId('admin.moderacao.row-p1');
    expect(screen.getByTestId('admin.moderacao.tab-review')).toHaveTextContent('Revisar (1)');
    await userEvent.click(screen.getByTestId('admin.moderacao.row-p1-open'));
    expect(screen.getByText('Esta loja teve 3 remoções em 30 dias.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.moderacao.keep'));
    await waitFor(() => expect(calls.some((c) => path(c.url).endsWith('/keep'))).toBe(true));
    expect(await screen.findByText('Produto mantido no ar.')).toBeInTheDocument();
  });

  it('remover exige motivo e confirma', async () => {
    const { impl, calls } = server([product()]);
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationPage />, 'super_admin');
    await userEvent.click(await screen.findByTestId('admin.moderacao.row-p1-open'));
    await userEvent.click(screen.getByTestId('admin.moderacao.remove'));
    expect(screen.getByText('Remover Camiseta Réplica?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.moderacao.remove-confirm'));
    expect(calls.some((c) => path(c.url).endsWith('/remove'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Produto proibido' }));
    await userEvent.click(screen.getByTestId('admin.moderacao.remove-confirm'));
    await waitFor(() => expect(calls.some((c) => path(c.url).endsWith('/remove'))).toBe(true));
    expect(await screen.findByText('Produto removido. O lojista foi avisado.')).toBeInTheDocument();
  });

  it('vazio oferece ver todos; suporte só lê', async () => {
    vi.stubGlobal('fetch', server([]).impl);
    const view = renderPanel(<ModerationPage />, 'operations');
    expect(await screen.findByText('Nada para revisar')).toBeInTheDocument();
    view.unmount();
    vi.stubGlobal('fetch', server([product()]).impl);
    renderPanel(<ModerationPage />, 'support');
    await userEvent.click(await screen.findByTestId('admin.moderacao.row-p1-open'));
    expect(screen.getByText('Você pode ver este produto, mas não moderar.')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.moderacao.keep')).not.toBeInTheDocument();
  });
});

describe('ModerationRulesPage', () => {
  it('adiciona e remove palavra proibida', async () => {
    const { impl, calls } = mockFetch(
      (url) => (path(url) === 'admin/moderation/rules' ? json({ words: [{ id: 'w1', value: 'réplica' }], categories: [] }) : undefined),
      (url) => (path(url) === 'admin/categories' ? json({ data: [], nextCursor: null, icons: [] }) : undefined),
      (url) => (path(url) === 'admin/moderation/rules/words' ? json({ id: 'w2', value: 'falsificado' }) : undefined),
      (url) => (path(url) === 'admin/moderation/rules/words/w1' ? json(null, 204) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderPanel(<ModerationRulesPage />, 'operations');
    await userEvent.type(await screen.findByTestId('admin.moderacao.rule-word-input'), 'falsificado');
    await userEvent.click(screen.getByTestId('admin.moderacao.rule-word-add'));
    await waitFor(() => expect(JSON.parse(String(calls.find((c) => path(c.url) === 'admin/moderation/rules/words')!.init.body))).toEqual({ value: 'falsificado' }));
    await userEvent.click(screen.getByTestId('admin.moderacao.rule-word-w1-remove'));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'DELETE')).toBe(true));
  });
});
