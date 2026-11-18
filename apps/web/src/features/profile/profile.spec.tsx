import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { ProfilePage } from './profile-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/admin/perfil' }));

const sessions = { data: [{ id: 's1', current: true, createdAt: '2026-11-18T12:00:00Z', lastUsedAt: '2026-11-18T13:00:00Z', userAgent: 'Chrome, Windows', ip: '10.0.0.1' }], nextCursor: null };

afterEach(() => vi.unstubAllGlobals());

describe('ProfilePage (AC6)', () => {
  it('mostra quem sou, o perfil e os aparelhos', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(sessions)).impl);
    renderPanel(<ProfilePage />);
    expect(screen.getByTestId('admin.profile.me')).toHaveTextContent('ana@webag.local');
    expect(screen.getByTestId('admin.profile.me')).toHaveTextContent('Super admin');
    expect(await screen.findByText(/Chrome, Windows \(este\)/)).toBeInTheDocument();
    expect(screen.getByTestId('admin.profile.activity-link')).toBeInTheDocument();
  });

  it('valida a troca de senha antes de enviar', async () => {
    const { impl, calls } = mockFetch(() => json(sessions));
    vi.stubGlobal('fetch', impl);
    renderPanel(<ProfilePage />);
    await userEvent.click(screen.getByTestId('admin.profile.password-submit'));
    expect(screen.getByText('Digite a senha atual.')).toBeInTheDocument();
    expect(screen.getByText('Use ao menos 8 caracteres.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
  });

  it('troca a senha com a atual e a nova', async () => {
    const { impl, calls } = mockFetch((url, init) => (path(url) === 'me/password' && init.method === 'POST' ? json({ ok: true }) : json(sessions)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<ProfilePage />);
    await userEvent.type(screen.getByTestId('admin.profile.password-current-input'), 'SenhaAntiga#2026');
    await userEvent.type(screen.getByTestId('admin.profile.password-input'), 'SenhaNova#2027x');
    await userEvent.type(screen.getByTestId('admin.profile.password-confirm-input'), 'SenhaNova#2027x');
    await userEvent.click(screen.getByTestId('admin.profile.password-submit'));
    await waitFor(() => expect(calls.find((c) => path(c.url) === 'me/password')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => path(c.url) === 'me/password')!.init.body as string)).toEqual({ currentPassword: 'SenhaAntiga#2026', newPassword: 'SenhaNova#2027x' });
    expect(await screen.findByText('Senha alterada.')).toBeInTheDocument();
  });

  it('novos códigos de recuperação aparecem uma vez e avisam que os antigos morreram', async () => {
    vi.stubGlobal('fetch', mockFetch((url, init) => (path(url) === 'admin/totp/recovery-codes' && init.method === 'POST' ? json({ recoveryCodes: ['AAAA-1111', 'BBBB-2222'] }) : json(sessions))).impl);
    renderPanel(<ProfilePage />);
    await userEvent.click(screen.getByTestId('admin.profile.recovery-regenerate'));
    await userEvent.click(screen.getByTestId('admin.profile.recovery-confirm'));
    expect(await screen.findByTestId('admin.profile.recovery-list')).toHaveTextContent('AAAA-1111');
    expect(screen.getByText('Novos códigos gerados. Os antigos não valem mais.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.profile.recovery-done'));
    expect(screen.queryByTestId('admin.profile.recovery-list')).not.toBeInTheDocument();
  });

  it('sair de todos os aparelhos pede confirmação', async () => {
    const { impl, calls } = mockFetch((url, init) => (path(url) === 'auth/logout-all' ? json(undefined, 204) : init.method === 'POST' ? json(undefined, 204) : json(sessions)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<ProfilePage />);
    await userEvent.click(screen.getByTestId('admin.profile.logout-all'));
    expect(calls.some((c) => path(c.url) === 'auth/logout-all')).toBe(false);
    await userEvent.click(screen.getByTestId('admin.profile.logout-all-confirm'));
    await waitFor(() => expect(calls.some((c) => path(c.url) === 'auth/logout-all')).toBe(true));
  });

  it('erro nos aparelhos mostra tentar de novo', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ code: 'X', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<ProfilePage />);
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
