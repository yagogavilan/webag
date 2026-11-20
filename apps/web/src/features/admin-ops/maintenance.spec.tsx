import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminMaintenanceBanner, LojistaMaintenanceBanner } from '@/components/panel/maintenance-banner';
import { PublicShell } from '@/components/public/public-shell';
import { expectedBackText, isMaintenanceOn, maintenanceText } from '@/lib/maintenance';
import { ApiError } from '@/lib/api/errors';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { MaintenancePage, maintenanceError, maintenanceFormError } from './maintenance-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/manutencao' }));
afterEach(() => vi.unstubAllGlobals());

const off = { active: false, message: null, expectedBackAt: null, updatedAt: null, updatedByName: null };
const on = { active: true, message: 'Atualizando o sistema de pagamentos.', expectedBackAt: '2099-01-01T15:00:00Z', updatedAt: '2026-11-19T12:00:00Z', updatedByName: 'Ana Souza' };

describe('regras do aviso', () => {
  it('só há aviso com active=true; texto padrão quando a mensagem vem vazia', () => {
    expect(isMaintenanceOn(null)).toBe(false);
    expect(isMaintenanceOn({ active: false } as never)).toBe(false);
    expect(isMaintenanceOn({ active: true, message: null, expectedBackAt: null })).toBe(true);
    expect(maintenanceText({ active: true, message: '  ', expectedBackAt: null })).toContain('Estamos em manutenção');
    expect(maintenanceText({ active: true, message: 'Volto às 14h.', expectedBackAt: null })).toBe('Volto às 14h.');
  });
  it('previsão: hoje mostra só a hora; outro dia mostra data; inválida some', () => {
    const now = new Date('2026-11-19T15:00:00Z');
    expect(expectedBackText('2026-11-19T20:30:00Z', now)).toBe('Previsão de volta: hoje às 17:30.');
    expect(expectedBackText('2026-11-20T11:00:00Z', now)).toMatch(/Previsão de volta: 20 de nov, 08:00\./);
    expect(expectedBackText('x', now)).toBeNull();
    expect(expectedBackText(null, now)).toBeNull();
  });
  it('validação do formulário: mensagem curta e previsão no passado são erro; vazio vale', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(maintenanceFormError('', '', now)).toBeNull();
    expect(maintenanceFormError('abc', '', now)).toContain('ao menos 5');
    expect(maintenanceFormError('', '2020-01-01T10:00', now)).toContain('no futuro');
    expect(maintenanceFormError('Voltamos às 15h.', '2030-01-01T10:00', now)).toBeNull();
    expect(maintenanceError(new ApiError({ status: 403, title: 'x', code: 'FORBIDDEN' }))).toContain('super admin');
  });
});

describe('tela do modo manutenção (WB-121)', () => {
  const server = (state: { current: object; sent?: unknown }) =>
    mockFetch((url, init) => {
      if (path(url) === 'admin/maintenance' && init.method === 'PUT') {
        state.sent = JSON.parse(String(init.body));
        const body = state.sent as { enabled: boolean };
        state.current = body.enabled ? on : off;
        return json(state.current);
      }
      if (path(url) === 'admin/maintenance') return json(state.current);
      if (path(url) === 'admin/audit-log') return json({ data: [{ id: 1, at: '2026-11-19T12:00:00Z', actorId: 'u-1', actorRole: 'super_admin', action: 'maintenance.enable', targetType: 'platform', targetId: 'maintenance', before: null, after: null, ip: null, requestId: null, reason: 'Troca do gateway.' }], nextCursor: null });
      return undefined;
    });

  it('ligar: mostra o que para e o que continua, valida a previsão, envia mensagem, previsão e motivo; histórico da auditoria visível', async () => {
    const state: { current: object; sent?: unknown } = { current: off };
    vi.stubGlobal('fetch', server(state).impl);
    renderPanel(<MaintenancePage />);
    expect(await screen.findByTestId('admin.manutencao.state')).toHaveTextContent('Desligado');
    expect(screen.getByTestId('admin.manutencao.stops')).toHaveTextContent('Novos pedidos');
    expect(screen.getByTestId('admin.manutencao.keeps')).toHaveTextContent('Pedidos já criados');
    expect(await screen.findByTestId('admin.manutencao.history')).toHaveTextContent('Modo manutenção ligado · Super admin. Motivo: Troca do gateway.');
    expect(screen.getByTestId('admin.manutencao.audit-link')).toHaveAttribute('href', '/admin/auditoria?targetType=platform&targetId=maintenance');
    await userEvent.click(screen.getByTestId('admin.manutencao.turn-on'));
    await userEvent.type(screen.getByTestId('admin.manutencao.reason'), 'Troca do gateway.');
    await userEvent.type(screen.getByTestId('admin.manutencao.message'), 'abc');
    await userEvent.click(screen.getByTestId('admin.manutencao.on-confirm'));
    expect(await screen.findByText(/ao menos 5 caracteres/)).toBeInTheDocument();
    expect(state.sent).toBeUndefined();
    await userEvent.type(screen.getByTestId('admin.manutencao.message'), 'de, voltamos já');
    await userEvent.click(screen.getByTestId('admin.manutencao.on-confirm'));
    await waitFor(() => expect(state.sent).toEqual({ enabled: true, reason: 'Troca do gateway.', message: 'abcde, voltamos já' }));
    expect(await screen.findByTestId('admin.manutencao.on-block')).toHaveTextContent('Atualizando o sistema de pagamentos.');
    expect(screen.getByTestId('admin.manutencao.state')).toHaveTextContent('Ligado');
    expect(screen.getByTestId('admin.manutencao.last')).toHaveTextContent('por Ana Souza');
  });

  it('desligar exige o motivo e volta ao normal', async () => {
    const state: { current: object; sent?: unknown } = { current: on };
    vi.stubGlobal('fetch', server(state).impl);
    renderPanel(<MaintenancePage />);
    await userEvent.click(await screen.findByTestId('admin.manutencao.turn-off'));
    await userEvent.click(screen.getByTestId('admin.manutencao.off-confirm'));
    expect(await screen.findByText(/Escreva o motivo/)).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.manutencao.reason'), 'Troca concluída.');
    await userEvent.click(screen.getByTestId('admin.manutencao.off-confirm'));
    await waitFor(() => expect(state.sent).toEqual({ enabled: false, reason: 'Troca concluída.' }));
    expect(await screen.findByTestId('admin.manutencao.off-info')).toBeInTheDocument();
  });

  it('só o super admin: operação vê "sem acesso"; erro de carga tem tentar de novo', async () => {
    vi.stubGlobal('fetch', server({ current: off }).impl);
    const first = renderPanel(<MaintenancePage />, 'operations');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
    first.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ code: 'X', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<MaintenancePage />);
    expect(await screen.findByTestId('admin.manutencao.error')).toBeInTheDocument();
  });
});

describe('avisos de manutenção', () => {
  it('admin: qualquer perfil vê o aviso; só o super admin tem o link', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/maintenance' ? json(on) : undefined)).impl);
    const first = renderPanel(<AdminMaintenanceBanner canManage />);
    expect(await screen.findByTestId('admin.maintenance.banner')).toHaveTextContent('Modo manutenção ligado');
    expect(screen.getByRole('link', { name: /Abrir o modo manutenção/ })).toHaveAttribute('href', '/admin/manutencao');
    first.unmount();
    renderPanel(<AdminMaintenanceBanner canManage={false} />);
    await screen.findByTestId('admin.maintenance.banner');
    expect(screen.queryByRole('link', { name: /Abrir o modo manutenção/ })).not.toBeInTheDocument();
  });

  it('lojista: diz que pedidos novos pausam e que os pagos continuam; desligada ou com erro, nada', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url).endsWith('config/maintenance') ? json({ active: true, message: null, expectedBackAt: null }) : undefined)).impl);
    const first = renderPanel(<LojistaMaintenanceBanner />);
    expect(await screen.findByTestId('lojista.maintenance.banner')).toHaveTextContent('pedidos já pagos continuam com você');
    first.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ code: 'X', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<LojistaMaintenanceBanner />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('lojista.maintenance.banner')).not.toBeInTheDocument();
  });

  it('site público: aviso amigável com mensagem e previsão; sem manutenção, sem aviso', () => {
    const { rerender } = render(<PublicShell maintenance={{ active: true, message: 'Voltamos às 14h.', expectedBackAt: null }}><p>x</p></PublicShell>);
    expect(screen.getByTestId('public.maintenance')).toHaveTextContent('Voltamos já: estamos em manutenção');
    expect(screen.getByTestId('public.maintenance')).toHaveTextContent('Voltamos às 14h.');
    rerender(<PublicShell><p>x</p></PublicShell>);
    expect(screen.queryByTestId('public.maintenance')).not.toBeInTheDocument();
  });
});
