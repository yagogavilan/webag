import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { AdminsPage } from './admins-page';
import { isLastSuper } from './profiles';

const admin = (userId: string, name: string, profile: string, over: object = {}) => ({ userId, name, email: `${name.toLowerCase()}@webag.local`, profile, active: true, totpConfigured: true, ...over });
const list = (items: object[]) => ({ data: items, nextCursor: null });
const base = list([admin('u-1', 'Ana', 'super_admin'), admin('u-2', 'Bia', 'operations')]);

afterEach(() => vi.unstubAllGlobals());

describe('isLastSuper', () => {
  it('só é o último quando há um único super admin ativo', () => {
    expect(isLastSuper([{ userId: 'a', profile: 'super_admin', active: true }, { userId: 'b', profile: 'operations', active: true }], 'a')).toBe(true);
    expect(isLastSuper([{ userId: 'a', profile: 'super_admin', active: true }, { userId: 'c', profile: 'super_admin', active: true }], 'a')).toBe(false);
    expect(isLastSuper([{ userId: 'a', profile: 'super_admin', active: true }, { userId: 'c', profile: 'super_admin', active: false }], 'a')).toBe(true);
  });
});

describe('AdminsPage (AD7)', () => {
  it('a própria linha mostra "Você" e não tem menu de ações', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(base)).impl);
    renderPanel(<AdminsPage />);
    expect(await screen.findByText('Ana (Você)')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.admins.admin-u-1-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin.admins.admin-u-2-menu')).toBeInTheDocument();
  });

  it('convite valida os campos e envia nome, e-mail e perfil', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'POST' ? json({ invitationId: 'i', expiresAt: '2026-11-20T00:00:00Z' }) : json(base)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<AdminsPage />);
    await userEvent.click(await screen.findByTestId('admin.admins.invite-open'));
    await userEvent.click(screen.getByTestId('admin.admins.invite-submit'));
    expect(screen.getByText('Digite o nome.')).toBeInTheDocument();
    expect(screen.getByText('Confira o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Escolha um perfil.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.admins.invite-name-input'), 'Caio Lima');
    await userEvent.type(screen.getByTestId('admin.admins.invite-email-input'), 'caio@webag.local');
    await userEvent.click(screen.getByTestId('admin.admins.invite-profile-finance'));
    await userEvent.click(screen.getByTestId('admin.admins.invite-submit'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'POST')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'POST')!.init.body as string)).toEqual({ name: 'Caio Lima', email: 'caio@webag.local', profile: 'finance' });
    expect(await screen.findByText('Convite enviado para caio@webag.local.')).toBeInTheDocument();
  });

  it('e-mail que já tem conta aparece no campo', async () => {
    vi.stubGlobal('fetch', mockFetch((url, init) => (init.method === 'POST' ? json({ code: 'EMAIL_ALREADY_REGISTERED', title: 'x', status: 409 }, 409) : json(base))).impl);
    renderPanel(<AdminsPage />);
    await userEvent.click(await screen.findByTestId('admin.admins.invite-open'));
    await userEvent.type(screen.getByTestId('admin.admins.invite-name-input'), 'Caio Lima');
    await userEvent.type(screen.getByTestId('admin.admins.invite-email-input'), 'caio@webag.local');
    await userEvent.click(screen.getByTestId('admin.admins.invite-profile-support'));
    await userEvent.click(screen.getByTestId('admin.admins.invite-submit'));
    expect(await screen.findByText(/Esse e-mail já tem conta/)).toBeInTheDocument();
  });

  it('pede o TOTP quando a API exige reautenticação e repete a ação', async () => {
    let first = true;
    const { impl, calls } = mockFetch((url, init) => {
      if (path(url) === 'auth/reauth') return json(undefined, 204);
      if (init.method === 'PATCH') {
        if (first) {
          first = false;
          return json({ code: 'REAUTH_REQUIRED', title: 'x', status: 403 }, 403);
        }
        return json(undefined, 204);
      }
      return json(base);
    });
    vi.stubGlobal('fetch', impl);
    renderPanel(<AdminsPage />);
    await userEvent.click(await screen.findByTestId('admin.admins.admin-u-2-menu'));
    await userEvent.click(await screen.findByTestId('admin.admins.admin-u-2-deactivate'));
    await userEvent.click(screen.getByTestId('admin.admins.active-confirm'));
    await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '123456');
    await waitFor(() => expect(calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(2));
    expect(await screen.findByText('Bia foi desativada.')).toBeInTheDocument();
  });

  it('último super admin: dialog informativo em vez de desativar', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(list([admin('u-2', 'Bia', 'super_admin'), admin('u-3', 'Caio', 'operations')]))).impl);
    renderPanel(<AdminsPage />);
    await userEvent.click(await screen.findByTestId('admin.admins.admin-u-2-menu'));
    await userEvent.click(screen.getByTestId('admin.admins.admin-u-2-deactivate'));
    expect(screen.getByTestId('admin.admins.last-super-dialog')).toHaveTextContent('Precisa existir ao menos 1 super admin.');
  });

  it('redefinir verificação exige motivo de 20 caracteres e o canal', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'POST' ? json(undefined, 204) : json(base)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<AdminsPage />);
    await userEvent.click(await screen.findByTestId('admin.admins.admin-u-2-menu'));
    await userEvent.click(screen.getByTestId('admin.admins.admin-u-2-reset-totp'));
    await userEvent.type(screen.getByTestId('admin.admins.reset-reason-input'), 'Perdeu o aparelho');
    await userEvent.click(screen.getByTestId('admin.admins.reset-confirm'));
    expect(screen.getByText('Escreva o motivo (mínimo 20 caracteres).')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.admins.reset-reason-input'), ' e conferi por vídeo');
    await userEvent.click(screen.getByTestId('admin.admins.reset-confirm'));
    expect(await screen.findByText('Informe como a identidade foi conferida.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId('admin.admins.reset-channel'), 'video_call');
    await userEvent.click(screen.getByTestId('admin.admins.reset-confirm'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'POST')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'POST')!.init.body as string)).toMatchObject({ verifiedChannel: 'video_call' });
  });

  it('a aba de perfis mostra a matriz em texto', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(base)).impl);
    renderPanel(<AdminsPage />);
    await userEvent.click(await screen.findByTestId('admin.admins.tab-profiles'));
    expect(screen.getByTestId('admin.admins.profile-matrix')).toHaveTextContent('Estornar acima de R$ 500');
    expect(screen.getAllByText('Só vê').length).toBeGreaterThan(0);
  });

  it('outros perfis não veem a tela', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(base)).impl);
    renderPanel(<AdminsPage />, 'finance');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});
