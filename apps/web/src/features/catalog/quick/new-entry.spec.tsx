import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../../test/lojista';
import { Entry, NewProductEntry } from './new-entry';
import { NewProductLink } from './new-product-link';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace }), usePathname: () => '/lojista/produtos/novo' }));

const P = '/api/proxy/lojista/stores/s1';
const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    onlineManager.setOnline(value);
  });
};

beforeEach(() => {
  replace.mockClear();
  sessionStorage.clear();
  setOnline(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('"Novo produto" (WB-370 C1, C8; WB-371 C2)', () => {
  it('cria o rascunho ANTES da câmera, só com a via, com Idempotency-Key, e leva à tela do rascunho com a câmera', async () => {
    const { impl, calls } = mockFetch((url, init) => (url.pathname === `${P}/product-drafts` && init.method === 'POST' ? json({ id: 'p9', version: 1 }, 201) : undefined), ...storeHandlers(fakeStore({ status: 'approved', step: 4 })));
    vi.stubGlobal('fetch', impl);
    renderLojista(<NewProductEntry />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lojista/produtos/novo/p9?camera=1'));
    const post = calls.filter((c) => c.url.pathname.endsWith('/product-drafts') && c.init.method === 'POST');
    expect(post).toHaveLength(1);
    // WB-379 C1: o front informa só a via (sem nome, preço nem id de sessão).
    expect(JSON.parse(String(post[0]?.init.body))).toEqual({ via: 'camera' });
    const headers = post[0]?.init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toMatch(/^novo-[A-Za-z0-9_-]{8,}$/);
    expect(Object.keys(headers).join(' ').toLowerCase()).not.toContain('session');
  });

  it('C2: com 100 rascunhos mostra "Limite de 100 rascunhos..." e nenhum rascunho novo', async () => {
    const { impl } = mockFetch((url, init) => (url.pathname === `${P}/product-drafts` && init.method === 'POST' ? json({ code: 'DRAFT_LIMIT_REACHED', title: 'Limite', status: 422 }, 422) : undefined), ...storeHandlers(fakeStore({ status: 'approved', step: 4 })));
    vi.stubGlobal('fetch', impl);
    renderLojista(<NewProductEntry />);
    expect(await screen.findByText('Limite de 100 rascunhos. Publique ou apague algum para criar outro.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver rascunhos' })).toHaveAttribute('href', '/lojista/produtos?filtro=draft');
    expect(replace).not.toHaveBeenCalled();
  });

  it('C8: sem internet não cria nada; mostra o motivo e o botão é inerte', async () => {
    setOnline(false);
    const { impl, calls } = mockFetch(...storeHandlers(fakeStore({ status: 'approved', step: 4 })));
    vi.stubGlobal('fetch', impl);
    // Já dentro do painel (loja em cache): a tela de "Novo produto" diz o motivo em vez de tentar criar.
    renderLojista(<Entry storeId="s1" />);
    expect(await screen.findByTestId('lojista.rapido.entry-offline')).toHaveTextContent('Sem internet. Conecte para criar o produto.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveAttribute('aria-disabled', 'true');
    expect(calls.some((c) => c.url.pathname.endsWith('/product-drafts'))).toBe(false);
  });

  it('falha de servidor oferece "Tentar de novo" e repete com a mesma chave (não duplica rascunho)', async () => {
    let attempts = 0;
    const { impl, calls } = mockFetch(
      (url, init) => {
        if (url.pathname !== `${P}/product-drafts` || init.method !== 'POST') return undefined;
        attempts += 1;
        return attempts === 1 ? json({ code: 'INTERNAL', title: 'x', status: 500 }, 500) : json({ id: 'p9', version: 1 }, 201);
      },
      ...storeHandlers(fakeStore({ status: 'approved', step: 4 })),
    );
    vi.stubGlobal('fetch', impl);
    renderLojista(<NewProductEntry />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const keys = calls.filter((c) => c.init.method === 'POST' && c.url.pathname.endsWith('/product-drafts')).map((c) => (c.init.headers as Record<string, string>)['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe('Botão "Novo produto" da lista', () => {
  it('online é link; offline fica inerte (aria-disabled) e, ao tocar, mostra o motivo', async () => {
    renderLojista(<NewProductLink />);
    expect(screen.getByRole('link', { name: /Novo produto/ })).toHaveAttribute('href', '/lojista/produtos/novo');
    setOnline(false);
    const button = await screen.findByRole('button', { name: /Novo produto/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem internet. Conecte para criar o produto.');
  });
});
