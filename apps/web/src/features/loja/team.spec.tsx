import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { TeamPage } from './team-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/equipe' }));

const members = (extra: object[] = []) => ({
  members: [{ userId: 'u0', name: 'Marcos Silva', email: 'marcos@casabela.com.br', role: 'owner', permissions: [] }, ...extra],
  invitations: [],
});
const joana = { userId: 'u1', name: 'Joana Lima', email: 'joana@exemplo.com', role: 'staff', permissions: ['orders'] };

function setup(team: object, onWrite?: Parameters<typeof mockFetch>[0]) {
  const store = fakeStore({ status: 'approved', step: 4 });
  return mockFetch(...(onWrite ? [onWrite] : []), (url) => (url.pathname === '/api/proxy/lojista/stores/s1/members' ? json(team) : undefined), ...storeHandlers(store));
}

afterEach(() => vi.unstubAllGlobals());

describe('Equipe (L9)', () => {
  it('sozinho: vazio com convite; convidar manda e-mail, nome e só Pedidos marcado', async () => {
    const { impl, calls } = setup(members(), (url, init) => (url.pathname.endsWith('/members/invitations') && init.method === 'POST' ? json({ invitationId: 'i1', expiresAt: '2026-11-25T12:00:00Z' }, 201) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<TeamPage />);
    expect(await screen.findByText('Você trabalha sozinho por enquanto')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.equipe.invite-open'));
    expect(screen.getByTestId('lojista.equipe.perm-orders')).toBeChecked();
    expect(screen.getByTestId('lojista.equipe.perm-catalog')).not.toBeChecked();
    await userEvent.click(screen.getByTestId('lojista.equipe.invite-submit'));
    expect(await screen.findByText('Confira o e-mail.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('lojista.equipe.invite-email-input'), 'joana@exemplo.com');
    await userEvent.type(screen.getByTestId('lojista.equipe.invite-name-input'), 'Joana Lima');
    await userEvent.click(screen.getByTestId('lojista.equipe.perm-exchanges'));
    await userEvent.click(screen.getByTestId('lojista.equipe.invite-submit'));
    await waitFor(() => expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/invitations'))!.init.body))).toEqual({ email: 'joana@exemplo.com', name: 'Joana Lima', permissions: ['orders', 'exchanges'] }));
    expect(await screen.findByText('Convite enviado para joana@exemplo.com.')).toBeInTheDocument();
  });

  it('lista o dono primeiro e remove pedindo a senha de novo', async () => {
    let reauthed = false;
    const { impl, calls } = setup(members([joana]), (url, init) => {
      if (url.pathname.endsWith('/auth/reauth')) {
        reauthed = true;
        return json(null, 204);
      }
      if (url.pathname.endsWith('/members/u1') && init.method === 'DELETE') return reauthed ? json(null, 204) : json({ code: 'REAUTH_REQUIRED', title: 'x', status: 403 }, 403);
      return undefined;
    });
    vi.stubGlobal('fetch', impl);
    renderLojista(<TeamPage />);
    const list = await screen.findByTestId('lojista.equipe.list');
    expect(list.children[0]).toHaveTextContent('Dono');
    expect(list.children[1]).toHaveTextContent('Pedidos');
    await userEvent.click(screen.getByRole('button', { name: /Ações de Joana Lima/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remover da equipe' }));
    expect(screen.getByText('Remover Joana?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.equipe.remove-confirm'));
    expect(await screen.findByText('Digite sua senha para remover da equipe.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('lojista.reauth.password-input'), 'Webag-Lojista-2026!{Enter}');
    await waitFor(() => expect(calls.filter((c) => c.init.method === 'DELETE')).toHaveLength(2));
  });

  it('funcionário não vê a equipe', async () => {
    vi.stubGlobal('fetch', mockFetch(...storeHandlers(fakeStore({ status: 'approved', role: 'staff' }))).impl);
    renderLojista(<TeamPage />);
    expect(await screen.findByText('Peça ao dono da loja para liberar.')).toBeInTheDocument();
  });
});
