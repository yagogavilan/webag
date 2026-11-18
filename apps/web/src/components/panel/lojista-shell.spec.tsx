import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchantStore } from '@/lib/api/lojista';
import type { Me } from '@/lib/session-types';
import { mockFetch } from '../../../test/render';
import { fakeStore, storeHandlers } from '../../../test/lojista';
import { LojistaShell } from './lojista-shell';

const replace = vi.fn();
let pathname = '/lojista';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));

const user: Me = { id: 'u1', email: 'marcos@casabela.com.br', emailVerified: true, name: 'Marcos', phone: null, roles: ['customer', 'merchant'], adminProfile: null };
const baseStore = fakeStore({ status: 'in_review', name: 'Casa Bela', step: 4, legalType: 'cpf', document: '52998224725' });

function setup(store: Partial<MerchantStore> | 'none' = {}) {
  const { impl, calls } = mockFetch(
    ...storeHandlers(store === 'none' ? null : { ...baseStore, ...store }),
    (url) => (url.pathname.endsWith('/logout') ? new Response(null, { status: 204 }) : undefined),
  );
  vi.stubGlobal('fetch', impl);
  render(
    <LojistaShell user={user}>
      <h1>Conteúdo</h1>
    </LojistaShell>,
  );
  return calls;
}

describe('LojistaShell', () => {
  beforeEach(() => {
    replace.mockReset();
    pathname = '/lojista';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra nome da loja, chip de estado, navegação nas duas barras e o conteúdo', async () => {
    setup();
    expect(await screen.findByText('Casa Bela')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.shell.status-chip')).toHaveTextContent('Em análise');
    expect(screen.getByTestId('lojista.nav.inicio')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('lojista.nav.equipe-bottom')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Conteúdo' })).toBeInTheDocument();
    expect(screen.getByText('Pular para o conteúdo')).toBeInTheDocument();
  });

  it('funcionário não vê Equipe', async () => {
    setup({ role: 'staff' });
    await screen.findByText('Casa Bela');
    expect(screen.queryByTestId('lojista.nav.equipe')).toBeNull();
  });

  it('loja suspensa mostra a faixa de erro global', async () => {
    setup({ status: 'suspended' });
    expect(await screen.findByTestId('lojista.shell.suspended-banner')).toHaveAttribute('role', 'alert');
  });

  it('sem conexão mostra a faixa e, ao voltar, o aviso', async () => {
    setup();
    await screen.findByText('Casa Bela');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByTestId('lojista.shell.offline-banner')).toHaveTextContent('Sem conexão. Mostrando o que já carregou.');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    expect(await screen.findByText('Conectado de novo')).toBeInTheDocument();
  });

  it('Sair fica sempre visível, encerra a sessão e volta ao login', async () => {
    const calls = setup();
    await userEvent.click(await screen.findByTestId('lojista.shell.logout'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lojista/entrar'));
    expect(calls.some((c) => c.url.pathname === '/api/session/lojista/logout')).toBe(true);
  });
});
