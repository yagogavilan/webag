import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../../test/render';
import { renderLojista } from '../../../../test/lojista';
import { DraftsPanel } from './drafts-panel';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lojista/produtos' }));
afterEach(() => vi.unstubAllGlobals());

const P = '/api/proxy/lojista/stores/s1';
const draft = (over = {}) => ({ id: 'd1', name: 'Camiseta básica preta', basePriceCents: null, cover: null, missing: ['price', 'photo'], updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), expiresAt: '2026-12-22T00:00:00Z', expiresInDays: 30, version: 3, via: 'camera', ...over });
const page = (data: unknown[], count = data.length) => json({ data, nextCursor: null, count, limit: 100 });
const listHandler = (data: unknown[], count?: number) => (url: URL) => (url.pathname === `${P}/product-drafts` ? page(data, count) : undefined);

describe('Rascunhos (WB-371, WB-372)', () => {
  it('C6: lista separada com contagem, o que falta e há quanto tempo salvou', async () => {
    vi.stubGlobal('fetch', mockFetch(listHandler([draft(), draft({ id: 'd2', name: '', missing: ['name', 'photo'] })])).impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    expect(await screen.findByRole('heading', { name: 'Rascunhos (2)' })).toBeInTheDocument();
    const item = screen.getByTestId('lojista.rascunhos.item-d1');
    expect(item).toHaveTextContent('Camiseta básica preta');
    expect(item).toHaveTextContent('Falta o preço e a foto');
    expect(item).toHaveTextContent('salvo há 2 h');
    expect(screen.getByTestId('lojista.rascunhos.item-d2')).toHaveTextContent('Sem nome');
    expect(within(item).getByRole('link', { name: 'Continuar Camiseta básica preta' })).toHaveAttribute('href', '/lojista/produtos/novo/d1');
  });

  it('C3: aos 27 dias avisa "Será apagado em 3 dias"', async () => {
    vi.stubGlobal('fetch', mockFetch(listHandler([draft({ expiresInDays: 3 }), draft({ id: 'd2', expiresInDays: 1 })])).impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    expect(await screen.findByTestId('lojista.rascunhos.expires-d1')).toHaveTextContent('Será apagado em 3 dias');
    expect(screen.getByTestId('lojista.rascunhos.expires-d2')).toHaveTextContent('Será apagado em 1 dia');
  });

  it('C2: no teto de 100 mostra o limite', async () => {
    vi.stubGlobal('fetch', mockFetch(listHandler([draft()], 100)).impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    expect(await screen.findByTestId('lojista.rascunhos.limit')).toHaveTextContent('Limite de 100 rascunhos. Publique ou apague algum para criar outro.');
  });

  it('vazio explica e oferece o próximo passo', async () => {
    vi.stubGlobal('fetch', mockFetch(listHandler([])).impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    expect(await screen.findByText('Nenhum rascunho')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Novo produto/ })).toBeInTheDocument();
  });

  it('erro mostra "Tentar de novo" e recarrega', async () => {
    let fail = true;
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname === `${P}/product-drafts` ? (fail ? json({ code: 'X', title: 'x', status: 500 }, 500) : page([draft()])) : undefined)).impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByText('Camiseta básica preta')).toBeInTheDocument();
  });

  it('WB-372 C1: "Duplicar" cria a cópia com chave de idempotência e abre a câmera da cópia', async () => {
    const { impl, calls } = mockFetch(listHandler([draft()]), (url, init) => (url.pathname === `${P}/products/d1/duplicate` && init.method === 'POST' ? json({ id: 'd9', name: 'Camiseta básica preta (cópia)' }, 201) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicar Camiseta básica preta' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/produtos/novo/d9?camera=1'));
    const call = calls.find((c) => c.url.pathname.endsWith('/duplicate'));
    expect((call?.init.headers as Record<string, string>)['idempotency-key']).toMatch(/^dup-[A-Za-z0-9_-]{8,}$/);
  });

  it('WB-372 C5/C-limite: duplicar com 100 rascunhos mostra o limite', async () => {
    vi.stubGlobal('fetch', mockFetch(listHandler([draft()]), (url, init) => (url.pathname.endsWith('/duplicate') && init.method === 'POST' ? json({ code: 'DRAFT_LIMIT_REACHED', title: 'x', status: 422 }, 422) : undefined)).impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicar Camiseta básica preta' }));
    expect(await screen.findByTestId('lojista.rascunhos.dup-error')).toHaveTextContent('Limite de 100 rascunhos');
  });

  it('rascunho completo publica direto pela lista; incompleto só continua', async () => {
    const { impl, calls } = mockFetch(listHandler([draft({ id: 'ok', missing: [] }), draft({ id: 'inc' })]), (url, init) => (url.pathname === `${P}/products/ok/publish` && init.method === 'POST' ? json({ id: 'ok', status: 'active' }) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    await userEvent.click(await screen.findByTestId('lojista.rascunhos.publish-ok'));
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/products/ok/publish'))).toBe(true));
    expect(screen.queryByTestId('lojista.rascunhos.publish-inc')).not.toBeInTheDocument();
    expect(screen.getByTestId('lojista.rascunhos.continue-inc')).toBeInTheDocument();
  });

  it('apagar pede confirmação e remove o rascunho', async () => {
    const { impl, calls } = mockFetch(listHandler([draft()]), (url, init) => (url.pathname === `${P}/products/d1` && init.method === 'DELETE' ? json(null, 204) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<DraftsPanel storeId="s1" />);
    await userEvent.click(await screen.findByTestId('lojista.rascunhos.delete-d1'));
    expect(calls.some((c) => c.init.method === 'DELETE')).toBe(false);
    await userEvent.click(await screen.findByTestId('lojista.rascunhos.delete-confirm-d1'));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'DELETE')).toBe(true));
  });
});
