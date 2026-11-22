import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayEndIso, dayStartIso } from '@/lib/api/admin-ops';
import { ApiError } from '@/lib/api/errors';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { AdminOrderDetailPage, needsSuperAdmin, orderActionError } from './order-detail-page';
import { AdminOrdersPage, orderSearchError, periodError } from './orders-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/pedidos' }));
afterEach(() => vi.unstubAllGlobals());

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const row = (over: object = {}) => ({ id: 'o1', number: 'WB-9X', status: 'received', mode: 'delivery', paymentMethod: 'pix', createdAt: '2026-11-19T12:00:00Z', paidAt: '2026-11-19T12:01:00Z', store: { id: 's1', name: 'Mercadinho Boa Compra', city: 'Francisco Morato' }, customer: { id: 'u1', name: 'Maria L.' }, total: money(5990), ...over });
const detail = (over: object = {}) => ({
  ...row(), acceptedAt: null, deliveredAt: null, cancelledAt: null, cancelledBy: null, cancelReason: null, disputedAt: null, notReceivedAt: null, couponCode: null,
  customer: { id: 'u1', name: 'Maria L.', emailMasked: 'm***@gmail.com', phoneMasked: '(11) *****-1234' },
  delivery: { neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', logistics: null },
  items: [{ name: 'Arroz 5 kg', attributes: {}, quantity: 2, unitPrice: money(2500), lineTotal: money(5000) }],
  values: { subtotal: money(5000), delivery: money(600), serviceFee: money(390), storeDiscount: money(0), platformDiscount: money(0), total: money(5990), commission: money(750), applicationFee: money(1140), merchantNetBeforeProviderFee: money(4250) },
  payment: { method: 'pix', status: 'approved', installments: 1, declineReason: null, attempts: [{ id: 'a1', status: 'approved', method: 'pix', amount: money(5990), createdAt: '2026-11-19T12:00:30Z' }] },
  refunds: { paid: money(5990), refunded: money(0), remaining: money(5990), items: [] },
  timeline: [{ status: 'received', from: null, at: '2026-11-19T12:01:00Z', actor: 'system', actorName: null, reason: null }],
  exchanges: [], review: null, allowedActions: ['cancel', 'refund'], refundLimit: { superAdminOnlyAboveCents: 50000, profileCapCents: 50000 }, ...over,
});

describe('lista de pedidos do admin (B5, WB-108 C1)', () => {
  it('mostra o pedido mascarado e manda filtros, busca e período (dia de Brasília) à API', async () => {
    const queries: string[] = [];
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders' ? (queries.push(url.search), json({ data: [row()], nextCursor: null })) : undefined)).impl);
    renderPanel(<AdminOrdersPage />, 'operations');
    expect(await screen.findByTestId('admin.pedidos.row-o1')).toHaveTextContent('Maria L.');
    expect(screen.getByTestId('admin.pedidos.row-o1')).toHaveTextContent('Aguardando a loja');
    expect(screen.getByTestId('admin.pedidos.open-o1')).toHaveAttribute('href', '/admin/pedidos/o1');
    await userEvent.click(screen.getByTestId('admin.pedidos.filter-cancelled'));
    await waitFor(() => expect(queries.some((q) => q.includes('status=cancelled%2Crefused%2Cexpired'))).toBe(true));
    await userEvent.selectOptions(screen.getByTestId('admin.pedidos.payment'), 'card');
    await userEvent.type(screen.getByTestId('admin.pedidos.search'), 'WB-9X{Enter}');
    await userEvent.type(screen.getByTestId('admin.pedidos.from'), '2026-11-01');
    await waitFor(() => expect(queries.some((q) => q.includes('q=WB-9X') && q.includes('paymentMethod=card') && q.includes('from=2026-11-01T03%3A00%3A00.000Z'))).toBe(true));
  });

  it('período invertido e busca curta dão erro em texto sem chamar a API com o período errado', async () => {
    const queries: string[] = [];
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders' ? (queries.push(url.search), json({ data: [], nextCursor: null })) : undefined)).impl);
    renderPanel(<AdminOrdersPage />);
    await screen.findByTestId('admin.pedidos.empty');
    await userEvent.type(screen.getByTestId('admin.pedidos.from'), '2026-11-10');
    await userEvent.type(screen.getByTestId('admin.pedidos.to'), '2026-11-01');
    expect(await screen.findByText('A data final é anterior à inicial.')).toBeInTheDocument();
    expect(queries.some((q) => q.includes('to='))).toBe(false);
    expect(periodError('2026-11-10', '2026-11-01')).toBeTruthy();
    expect(periodError('2026-11-01', '2026-11-01')).toBeUndefined();
    expect(orderSearchError('a')).toBeTruthy();
    expect(dayStartIso('2026-11-01')).toBe('2026-11-01T03:00:00.000Z');
    expect(dayEndIso('2026-11-01')).toBe('2026-11-02T02:59:59.999Z');
    expect(dayStartIso('x')).toBeUndefined();
  });

  it('filtro vindo da conta aparece com como tirar; vazio com filtro e erro com tentar de novo; financeiro e suporte entram', async () => {
    const queries: string[] = [];
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders' ? (queries.push(url.search), json({ data: [], nextCursor: null })) : undefined)).impl);
    const first = renderPanel(<AdminOrdersPage initialUserId="11111111-1111-4111-8111-111111111111" />, 'support');
    expect(await screen.findByTestId('admin.pedidos.empty')).toHaveTextContent('Nenhum pedido encontrado');
    expect(queries[0]).toContain('userId=11111111');
    await userEvent.click(screen.getByTestId('admin.pedidos.clear-user'));
    await waitFor(() => expect(queries.at(-1)).not.toContain('userId='));
    first.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ code: 'X', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<AdminOrdersPage />, 'finance');
    expect(await screen.findByTestId('admin.pedidos.error')).toBeInTheDocument();
  });
});

describe('detalhe do pedido e intervenção (B5, WB-108 C2, WB-109)', () => {
  it('mostra dados mascarados, valores RN-10, linha do tempo e o endereço só com bairro e cidade', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders/o1' ? json(detail()) : undefined)).impl);
    renderPanel(<AdminOrderDetailPage id="o1" />, 'support');
    expect(await screen.findByTestId('admin.pedidos.email')).toHaveTextContent('m***@gmail.com');
    expect(screen.getByTestId('admin.pedidos.phone')).toHaveTextContent('(11) *****-1234');
    expect(screen.getByTestId('admin.pedidos.delivery')).toHaveTextContent('Centro, Francisco Morato, SP');
    expect(screen.getByTestId('admin.pedidos.delivery')).toHaveTextContent('Rua, número e complemento não aparecem aqui.');
    expect(screen.getByTestId('admin.pedidos.total')).toHaveTextContent('R$ 59,90');
    expect(screen.getByTestId('admin.pedidos.values')).not.toHaveTextContent('Comissão da Webag');
    expect(screen.getByTestId('admin.pedidos.split-hidden')).toHaveTextContent('do financeiro e do super admin');
    expect(screen.getByTestId('admin.pedidos.timeline')).toHaveTextContent('Sistema');
    // WB-352 C14: nota de proteção (a abertura foi registrada antes do dado) e orientação de contato, sem "Revelar".
    expect(screen.getByTestId('admin.pedidos.protected-note')).toHaveTextContent('Esta abertura ficou registrada com o seu nome.');
    expect(screen.getByTestId('admin.pedidos.contact-help')).toHaveTextContent('use o canal da Webag');
    expect(screen.queryByRole('button', { name: /revelar/i })).not.toBeInTheDocument();
  });

  it('SEC-184: comissão e líquido só aparecem ao financeiro e ao super admin, e somem se a API mandar nulo', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders/o1' ? json(detail()) : undefined)).impl);
    const first = renderPanel(<AdminOrderDetailPage id="o1" />, 'finance');
    expect(await screen.findByTestId('admin.pedidos.commission')).toHaveTextContent('R$ 7,50');
    first.unmount();
    const nulled = detail();
    nulled.values = { ...nulled.values, commission: null, applicationFee: null, merchantNetBeforeProviderFee: null } as never;
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders/o1' ? json(nulled) : undefined)).impl);
    renderPanel(<AdminOrderDetailPage id="o1" />, 'super_admin');
    expect(await screen.findByTestId('admin.pedidos.split-hidden')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.pedidos.commission')).not.toBeInTheDocument();
  });

  it('operação e suporte não cancelam nem estornam (DEC-074c): sem botões e com o porquê em texto', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders/o1' ? json(detail({ allowedActions: [] })) : undefined)).impl);
    renderPanel(<AdminOrderDetailPage id="o1" />, 'operations');
    expect(await screen.findByTestId('admin.pedidos.no-actions')).toHaveTextContent('financeiro e do super admin');
    expect(screen.queryByTestId('admin.pedidos.cancel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin.pedidos.refund')).not.toBeInTheDocument();
  });

  it('segue allowedActions: só estorno quando o pedido já foi entregue', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders/o1' ? json(detail({ status: 'delivered', allowedActions: ['refund'] })) : undefined)).impl);
    renderPanel(<AdminOrderDetailPage id="o1" />, 'finance');
    expect(await screen.findByTestId('admin.pedidos.refund')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.pedidos.cancel')).not.toBeInTheDocument();
  });

  it('cancelar: diz os efeitos, exige o motivo, envia com estorno e repete após a reautenticação', async () => {
    const sent: unknown[] = [];
    let reauthed = false;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (path(url) === 'admin/orders/o1/cancel' && init.method === 'POST') {
          if (!reauthed) return json({ code: 'REAUTH_REQUIRED', title: 'x', status: 401 }, 403);
          sent.push(JSON.parse(String(init.body)));
          return json({ status: 'cancelled', refunded: money(5990), remaining: money(0) });
        }
        if (path(url) === 'auth/reauth') {
          reauthed = true;
          return json({ ok: true });
        }
        if (path(url) === 'admin/orders/o1') return json(detail());
        return undefined;
      }).impl,
    );
    renderPanel(<AdminOrderDetailPage id="o1" />, 'finance');
    await userEvent.click(await screen.findByTestId('admin.pedidos.cancel'));
    expect(screen.getByTestId('admin.pedidos.cancel-effects')).toHaveTextContent('estoque');
    await userEvent.click(screen.getByTestId('admin.pedidos.cancel-confirm'));
    expect(await screen.findByText(/Escreva o motivo/)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await userEvent.type(screen.getByTestId('admin.pedidos.cancel-reason'), 'Loja sem estoque do item.');
    await userEvent.click(screen.getByTestId('admin.pedidos.cancel-confirm'));
    await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '123456');
    await waitFor(() => expect(sent).toEqual([{ reason: 'Loja sem estoque do item.', refund: true }]));
  });

  it('financeiro acima do limite: o cancelamento com estorno pede super admin; sem estorno passa', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (path(url) === 'admin/orders/o1/cancel' && init.method === 'POST') {
          sent.push(JSON.parse(String(init.body)));
          return json({ status: 'cancelled', refunded: money(0), remaining: money(60000) });
        }
        if (path(url) === 'admin/orders/o1') return json(detail({ refunds: { paid: money(60000), refunded: money(0), remaining: money(60000), items: [] } }));
        return undefined;
      }).impl,
    );
    renderPanel(<AdminOrderDetailPage id="o1" />, 'finance');
    await userEvent.click(await screen.findByTestId('admin.pedidos.cancel'));
    expect(screen.getByTestId('admin.pedidos.cancel-limit')).toHaveTextContent('Peça aprovação a um super admin');
    await userEvent.type(screen.getByTestId('admin.pedidos.cancel-reason'), 'Cliente pediu o cancelamento.');
    await userEvent.click(screen.getByTestId('admin.pedidos.cancel-confirm'));
    expect(await screen.findByText(/Desmarque o estorno/)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await userEvent.click(screen.getByTestId('admin.pedidos.cancel-refund'));
    await userEvent.click(screen.getByTestId('admin.pedidos.cancel-confirm'));
    await waitFor(() => expect(sent).toEqual([{ reason: 'Cliente pediu o cancelamento.', refund: false }]));
  });

  it('estornar: valida o valor, manda Idempotency-Key e avisa quando o provedor deixou na fila', async () => {
    const calls: { body: unknown; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (path(url) === 'admin/orders/o1/refunds' && init.method === 'POST') {
          calls.push({ body: JSON.parse(String(init.body)), key: new Headers(init.headers).get('idempotency-key') });
          return json({ status: 'queued', refunded: money(1000), remaining: money(4990) });
        }
        if (path(url) === 'admin/orders/o1') return json(detail());
        return undefined;
      }).impl,
    );
    renderPanel(<AdminOrderDetailPage id="o1" />, 'super_admin');
    await userEvent.click(await screen.findByTestId('admin.pedidos.refund'));
    const amount = screen.getByTestId('admin.pedidos.refund-amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '80,00');
    await userEvent.type(screen.getByTestId('admin.pedidos.refund-reason'), 'Item veio errado.');
    await userEvent.click(screen.getByTestId('admin.pedidos.refund-confirm'));
    expect(await screen.findByText('O máximo é R$ 59,90.')).toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, '10,00');
    await userEvent.click(screen.getByTestId('admin.pedidos.refund-confirm'));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ amountCents: 1000, reason: 'Item veio errado.' });
    expect(calls[0]?.key).toMatch(/^refund-[0-9a-f-]{36}$/);
    expect(await screen.findByText(/ficou na fila/)).toBeInTheDocument();
  });

  it('pedido contestado, não encontrado e regras puras', async () => {
    expect(needsSuperAdmin(60000, { superAdminOnlyAboveCents: 50000, profileCapCents: null }, false)).toBe(true);
    expect(needsSuperAdmin(60000, { superAdminOnlyAboveCents: 50000, profileCapCents: null }, true)).toBe(false);
    expect(needsSuperAdmin(50000, { superAdminOnlyAboveCents: 50000, profileCapCents: null }, false)).toBe(false);
    expect(orderActionError(new ApiError({ status: 403, title: 'x', code: 'SUPER_ADMIN_REQUIRED' }))).toContain('super admin');
    expect(orderActionError(new ApiError({ status: 409, title: 'x', code: 'ORDER_NOT_CANCELLABLE' }))).toContain('não pode mais');
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/orders/o1' ? json(detail({ disputedAt: '2026-11-19T13:00:00Z', allowedActions: [] })) : json({ code: 'NOT_FOUND', title: 'x', status: 404 }, 404))).impl);
    const first = renderPanel(<AdminOrderDetailPage id="o1" />, 'finance');
    expect(await screen.findByTestId('admin.pedidos.disputed')).toHaveTextContent('chargeback');
    first.unmount();
    renderPanel(<AdminOrderDetailPage id="zz" />, 'finance');
    expect(await screen.findByTestId('admin.pedidos.not-found')).toHaveTextContent('Confira o número e busque de novo.');
    expect(screen.getByRole('link', { name: 'Voltar para as lojas' })).toHaveAttribute('href', '/admin/lojas');
  });
});
