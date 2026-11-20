import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { UserDetailPage, storesToSuspend, userActionError } from './user-detail-page';
import { UsersPage, searchError } from './users-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/usuarios' }));
afterEach(() => vi.unstubAllGlobals());

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const row = (over: object = {}) => ({ id: 'u1', name: 'Maria L.', emailMasked: 'm***@gmail.com', phoneMasked: '(11) *****-1234', roles: ['customer', 'merchant'], status: 'active', storeCount: 1, createdAt: '2026-10-01T12:00:00Z', lastLoginAt: '2026-11-18T12:00:00Z', ...over });
const detail = (over: object = {}) => ({
  ...row(), emailVerified: true, stores: [{ id: 's1', name: 'Mercadinho Boa Compra', status: 'approved', role: 'owner' }], recentOrders: [{ id: 'o1', number: 'WB-9X', status: 'delivered', mode: 'delivery', createdAt: '2026-11-17T12:00:00Z', total: money(5990), storeName: 'Mercadinho Boa Compra' }],
  blockHistory: [], allowedActions: ['block'], ...over,
});

describe('busca de usuários (B4, WB-102 C1)', () => {
  it('lista com dado mascarado e envia busca e filtros à API; erro de busca curta é em texto', async () => {
    const queries: string[] = [];
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/users' ? (queries.push(url.search), json({ data: [row(), row({ id: 'u2', name: 'João P.', status: 'blocked', roles: ['customer'], storeCount: 0 })], nextCursor: null })) : undefined)).impl);
    renderPanel(<UsersPage />, 'support');
    expect(await screen.findByTestId('admin.usuarios.row-u1')).toHaveTextContent('m***@gmail.com');
    expect(screen.getByTestId('admin.usuarios.status-u2')).toHaveTextContent('Bloqueada');
    await userEvent.type(screen.getByTestId('admin.usuarios.search'), 'm');
    await userEvent.click(screen.getByTestId('admin.usuarios.search-submit'));
    expect(await screen.findByText(/Digite ao menos 3 letras do nome/)).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.usuarios.search'), 'aria{Enter}');
    await waitFor(() => expect(queries.some((q) => q.includes('q=maria'))).toBe(true));
    expect(screen.getByText(/e-mail inteiro, celular completo/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId('admin.usuarios.status'), 'blocked');
    await waitFor(() => expect(queries.some((q) => q.includes('status=blocked') && q.includes('q=maria'))).toBe(true));
    expect(searchError('ma')).toBeTruthy();
    expect(searchError('mar')).toBeUndefined();
    expect(searchError('')).toBeUndefined();
  });

  it('429 da busca (limite por admin) tem texto próprio', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/users' ? json({ code: 'RATE_LIMITED', title: 'x', status: 429 }, 429) : undefined)).impl);
    renderPanel(<UsersPage />, 'support');
    expect(await screen.findByTestId('admin.usuarios.rate-limit')).toHaveTextContent('Muitas buscas');
  });

  it('vazio, erro e permissão: financeiro não vê a área', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/users' ? json({ data: [], nextCursor: null }) : undefined)).impl);
    const first = renderPanel(<UsersPage />, 'operations');
    expect(await screen.findByTestId('admin.usuarios.empty')).toBeInTheDocument();
    first.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ code: 'X', title: 'x', status: 500 }, 500)).impl);
    const second = renderPanel(<UsersPage />, 'operations');
    expect(await screen.findByTestId('admin.usuarios.error')).toBeInTheDocument();
    second.unmount();
    renderPanel(<UsersPage />, 'finance');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});

describe('detalhe e bloqueio (B4, WB-102 C3/C5)', () => {
  const server = (state: { current: object; blocked?: unknown; unblocked?: unknown }) =>
    mockFetch((url, init) => {
      if (path(url) === 'admin/users/u1/block' && init.method === 'POST') {
        state.blocked = JSON.parse(String(init.body));
        state.current = detail({ status: 'blocked', allowedActions: ['unblock'], stores: [{ id: 's1', name: 'Mercadinho Boa Compra', status: 'suspended', role: 'owner' }] });
        return json({ ...(state.current as object), suspendedStoreIds: ['s1'], failedStoreIds: [] });
      }
      if (path(url) === 'admin/users/u1/unblock' && init.method === 'POST') {
        state.unblocked = JSON.parse(String(init.body));
        state.current = detail({ stores: [{ id: 's1', name: 'Mercadinho Boa Compra', status: 'suspended', role: 'owner' }] });
        return json(state.current);
      }
      if (path(url) === 'admin/users/u1') return json(state.current);
      return undefined;
    });

  it('mostra dados mascarados, lojas e pedidos; o diálogo diz os efeitos e exige o motivo; após bloquear mostra a loja suspensa', async () => {
    const state: { current: object; blocked?: unknown } = { current: detail() };
    vi.stubGlobal('fetch', server(state).impl);
    renderPanel(<UserDetailPage id="u1" />, 'operations');
    expect(await screen.findByTestId('admin.usuarios.email')).toHaveTextContent('m***@gmail.com');
    expect(screen.getByTestId('admin.usuarios.order-o1')).toHaveAttribute('href', '/admin/pedidos/o1');
    expect(screen.getByTestId('admin.usuarios.all-orders')).toHaveAttribute('href', '/admin/pedidos?userId=u1');
    await userEvent.click(screen.getByTestId('admin.usuarios.block'));
    const effects = screen.getByTestId('admin.usuarios.block-effects');
    expect(effects).toHaveTextContent('sai de todos os aparelhos');
    expect(effects).toHaveTextContent('Mercadinho Boa Compra');
    expect(effects).toHaveTextContent('Pedidos em andamento não são cancelados');
    expect(effects).toHaveTextContent('O motivo é interno');
    await userEvent.click(screen.getByTestId('admin.usuarios.block-confirm'));
    expect(await screen.findByText(/Escreva o motivo/)).toBeInTheDocument();
    expect(state.blocked).toBeUndefined();
    await userEvent.type(screen.getByTestId('admin.usuarios.block-reason'), 'Fraude confirmada em 3 pedidos.');
    await userEvent.click(screen.getByTestId('admin.usuarios.block-confirm'));
    await waitFor(() => expect(state.blocked).toEqual({ reason: 'Fraude confirmada em 3 pedidos.' }));
    expect(await screen.findByTestId('admin.usuarios.suspended-stores')).toHaveTextContent('suspensa junto');
    expect(screen.getByTestId('admin.usuarios.detail-status')).toHaveTextContent('Bloqueada');
    expect(await screen.findByTestId('admin.usuarios.unblock')).toBeInTheDocument();
    expect(screen.getByTestId('admin.usuarios.stores-stay-suspended')).toHaveTextContent('não reativa a loja');
  });

  it('falha ao suspender uma loja não esconde o bloqueio: avisa e manda suspender em Lojas', async () => {
    const state: { current: object } = { current: detail() };
    vi.stubGlobal('fetch', mockFetch((url, init) => (path(url) === 'admin/users/u1/block' && init.method === 'POST' ? json({ ...detail({ status: 'blocked', allowedActions: ['unblock'] }), suspendedStoreIds: [], failedStoreIds: ['s1'] }) : path(url) === 'admin/users/u1' ? json(state.current) : undefined)).impl);
    renderPanel(<UserDetailPage id="u1" />);
    await userEvent.click(await screen.findByTestId('admin.usuarios.block'));
    await userEvent.type(screen.getByTestId('admin.usuarios.block-reason'), 'Golpe contra clientes.');
    await userEvent.click(screen.getByTestId('admin.usuarios.block-confirm'));
    expect(await screen.findByTestId('admin.usuarios.failed-stores')).toHaveTextContent('Suspenda em Lojas');
  });

  it('desbloquear diz que a loja não volta sozinha e envia o motivo', async () => {
    const state: { current: object; unblocked?: unknown } = { current: detail({ status: 'blocked', allowedActions: ['unblock'], stores: [{ id: 's1', name: 'Mercadinho Boa Compra', status: 'suspended', role: 'owner' }] }) };
    vi.stubGlobal('fetch', server(state).impl);
    renderPanel(<UserDetailPage id="u1" />, 'super_admin');
    await userEvent.click(await screen.findByTestId('admin.usuarios.unblock'));
    expect(screen.getByTestId('admin.usuarios.unblock-effects')).toHaveTextContent('não são reativadas sozinhas');
    await userEvent.type(screen.getByTestId('admin.usuarios.unblock-reason'), 'Contestação aceita pelo suporte.');
    await userEvent.click(screen.getByTestId('admin.usuarios.unblock-confirm'));
    await waitFor(() => expect(state.unblocked).toEqual({ reason: 'Contestação aceita pelo suporte.' }));
  });

  it('suporte só consulta (sem botão, com o porquê); conta de admin ou inexistente é 404 em texto', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/users/u1' ? json(detail({ allowedActions: [] })) : json({ code: 'NOT_FOUND', title: 'x', status: 404 }, 404))).impl);
    const first = renderPanel(<UserDetailPage id="u1" />, 'support');
    expect(await screen.findByTestId('admin.usuarios.read-only')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.usuarios.block')).not.toBeInTheDocument();
    first.unmount();
    renderPanel(<UserDetailPage id="zz" />, 'support');
    expect(await screen.findByTestId('admin.usuarios.not-found')).toBeInTheDocument();
  });

  it('regras puras: lojas suspensas junto e mensagens por código', () => {
    expect(storesToSuspend(detail({ stores: [{ id: 'a', name: 'A', status: 'approved', role: 'owner' }, { id: 'b', name: 'B', status: 'approved', role: 'staff' }, { id: 'c', name: 'C', status: 'in_review', role: 'owner' }] }) as never).map((s) => s.id)).toEqual(['a']);
    expect(userActionError(new ApiError({ status: 409, title: 'x', code: 'USER_ALREADY_BLOCKED' }))).toContain('já está bloqueada');
    expect(userActionError(new ApiError({ status: 409, title: 'x', code: 'USER_NOT_ACTIVE' }))).toContain('excluída');
  });
});
