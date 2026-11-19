import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canWaiveFee, feeState } from '@/lib/api/admin-exchanges';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { DisputesPage, decideError } from './disputes-page';
import { ExchangeCasePage, waiveError } from './exchange-case-page';
import { ApiError } from '@/lib/api/errors';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/disputas' }));
afterEach(() => vi.unstubAllGlobals());

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const item = (over: object = {}) => ({ id: 'm1', number: 'TR-4K7P2', orderId: 'o1', storeId: 's1', type: 'defect', resolution: 'refund', origin: 'store_refusal', storeReason: 'Mau uso do produto', customerText: 'Veio com defeito de fábrica.', photoCount: 2, startedAt: '2026-11-17T12:00:00Z', deadlineAt: '2026-11-24T12:00:00Z', overdue: false, refusalNotAllowedByLaw: true, ...over });
const exchange = (over: object = {}) => ({ id: 'e1', number: 'TR-4K7P2', orderId: 'o1', orderNumber: 'WB-9X', storeId: 's1', status: 'awaiting_fee', type: 'size_color', method: 'pickup_at_home', resolution: 'replace', quantity: 1, item: { orderItemId: 'i1', name: 'Camiseta', attributes: {}, unitPrice: money(5000) }, fee: money(600), difference: money(0), totalDue: money(600), feePaid: false, refund: money(0), answerDeadlineAt: '2026-11-18T12:00:00Z', windowEndsAt: '2026-11-30T12:00:00Z', autoApproved: true, decidedBy: 'system', decisionReason: null, contested: false, photoCount: 0, photos: [], timeline: [{ from: 'requested', to: 'approved', actor: 'system', reason: null, at: '2026-11-18T12:00:00Z' }], runs: [], createdAt: '2026-11-17T12:00:00Z', updatedAt: '2026-11-18T12:00:00Z', feeDueAt: '2026-11-20T12:00:00Z', ...over });

describe('regras da troca no admin', () => {
  it('estado da taxa em texto e quando dá para isentar', () => {
    expect(feeState(exchange() as never)).toBe('pending');
    expect(feeState(exchange({ feePaid: true }) as never)).toBe('paid');
    expect(feeState(exchange({ fee: money(0) }) as never)).toBe('waived');
    expect(feeState(exchange({ method: 'drop_at_store' }) as never)).toBe('not_applicable');
    expect(canWaiveFee(exchange() as never)).toBe(true);
    expect(canWaiveFee(exchange({ status: 'approved' }) as never)).toBe(false);
    expect(canWaiveFee(exchange({ feePaid: true }) as never)).toBe(false);
  });
  it('mensagens por código', () => {
    expect(decideError(new ApiError({ status: 409, title: 'x', code: 'EXCHANGE_NOT_IN_MEDIATION' } as never))).toContain('já decidiu');
    expect(waiveError(new ApiError({ status: 409, title: 'x', code: 'EXCHANGE_FEE_ALREADY_PAID' } as never))).toContain('já foi paga');
  });
});

describe('fila de mediação (AT3, WB-110)', () => {
  it('mostra o aviso de lei, exige escolher a decisão e o motivo, e envia', async () => {
    let sent: unknown = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/admin/exchanges/mediations/m1/decision') && init.method === 'POST') {
          sent = JSON.parse(String(init.body));
          return json({ status: 'decided' });
        }
        if (url.pathname.endsWith('/admin/exchanges/mediations')) return json({ data: [item()], nextCursor: null });
        return undefined;
      }).impl,
    );
    renderPanel(<DisputesPage />, 'operations');
    expect(await screen.findByTestId('admin.disputas.law-m1')).toHaveTextContent('A lei não permite');
    await userEvent.click(screen.getByTestId('admin.disputas.decide-m1'));
    await userEvent.click(screen.getByTestId('admin.disputas.decide-confirm'));
    expect(await screen.findByText('Escolha a decisão.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.disputas.decision-store'));
    expect(screen.getByTestId('admin.disputas.law-warning')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.disputas.decision-customer'));
    await userEvent.type(screen.getByTestId('admin.disputas.decide-reason'), 'Defeito comprovado pelas fotos');
    await userEvent.click(screen.getByTestId('admin.disputas.decide-confirm'));
    await waitFor(() => expect(sent).toEqual({ decision: 'customer', reason: 'Defeito comprovado pelas fotos' }));
  });

  it('caso já decidido por outra pessoa mostra a mensagem e mantém o diálogo', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/decision') && init.method === 'POST') return json({ type: 'x', title: 'x', status: 409, code: 'EXCHANGE_NOT_IN_MEDIATION' }, 409);
        if (url.pathname.endsWith('/admin/exchanges/mediations')) return json({ data: [item({ refusalNotAllowedByLaw: false, overdue: true })], nextCursor: null });
        return undefined;
      }).impl,
    );
    renderPanel(<DisputesPage />, 'super_admin');
    expect(await screen.findByText(/Prazo vencido em/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.disputas.decide-m1'));
    await userEvent.click(screen.getByTestId('admin.disputas.decision-store'));
    await userEvent.type(screen.getByTestId('admin.disputas.decide-reason'), 'Sem defeito nas fotos');
    await userEvent.click(screen.getByTestId('admin.disputas.decide-confirm'));
    expect(await screen.findByTestId('reason-error')).toHaveTextContent('Outra pessoa já decidiu');
  });

  it('vazio, erro e sem acesso do financeiro', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/mediations') ? json({ data: [], nextCursor: null }) : undefined)).impl);
    const a = renderPanel(<DisputesPage />, 'operations');
    expect(await screen.findByTestId('admin.disputas.empty')).toBeInTheDocument();
    a.unmount();
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/mediations') ? json({ type: 'x', title: 'x', status: 500 }, 500) : undefined)).impl);
    const b = renderPanel(<DisputesPage />, 'operations');
    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    b.unmount();
    renderPanel(<DisputesPage />, 'finance');
    expect(screen.getByText(/acesso/i)).toBeInTheDocument();
  });

  it('aba "Todas as trocas" filtra e busca pelo número', async () => {
    const { impl, calls } = mockFetch((url) => (url.pathname.endsWith('/admin/exchange-requests') ? json({ data: [exchange()], nextCursor: null }) : url.pathname.endsWith('/mediations') ? json({ data: [], nextCursor: null }) : undefined));
    vi.stubGlobal('fetch', impl);
    renderPanel(<DisputesPage />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.disputas.tab-all'));
    expect(await screen.findByTestId('admin.disputas.row-e1')).toHaveTextContent('TR-4K7P2');
    await userEvent.type(screen.getByTestId('admin.disputas.search'), 'TR');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Digite ao menos 3 caracteres do número (TR-...).')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.disputas.search'), '-4K');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get('q') === 'TR-4K')).toBe(true));
    await userEvent.click(screen.getByTestId('admin.disputas.filter-approved'));
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get('status') === 'approved')).toBe(true));
  });
});

describe('página da troca no admin (AT3)', () => {
  it('mostra valores, selo de aprovação automática e isenta a taxa com motivo', async () => {
    let body: unknown = null;
    let waived = false;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/waive-fee') && init.method === 'POST') {
          waived = true;
          body = JSON.parse(String(init.body));
          return json({ status: 'approved', fee: money(0), totalDue: money(0) });
        }
        if (url.pathname.endsWith('/admin/exchange-requests/e1')) return json(waived ? exchange({ status: 'approved', fee: money(0), totalDue: money(0) }) : exchange());
        return undefined;
      }).impl,
    );
    renderPanel(<ExchangeCasePage id="e1" />, 'operations');
    expect(await screen.findByTestId('admin.trocas.auto-approved')).toBeInTheDocument();
    expect(screen.getByTestId('admin.trocas.fee-state')).toHaveTextContent('Pendente');
    expect(screen.getByTestId('admin.trocas.timeline')).toHaveTextContent('Sistema');
    await userEvent.click(screen.getByTestId('admin.trocas.waive-fee'));
    await userEvent.click(screen.getByTestId('admin.trocas.waive-confirm'));
    expect(await screen.findByText(/Escreva o motivo/)).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.trocas.waive-reason'), 'Falha da coleta anterior');
    await userEvent.click(screen.getByTestId('admin.trocas.waive-confirm'));
    await waitFor(() => expect(body).toEqual({ reason: 'Falha da coleta anterior' }));
    await waitFor(() => expect(screen.getByTestId('admin.trocas.fee-state')).toHaveTextContent('Isenta'));
    expect(screen.queryByTestId('admin.trocas.waive-fee')).not.toBeInTheDocument();
  });

  it('taxa já paga não oferece isenção; 404 e erro têm estado próprio', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/e1') ? json(exchange({ feePaid: true, status: 'approved' })) : undefined)).impl);
    const a = renderPanel(<ExchangeCasePage id="e1" />, 'super_admin');
    expect(await screen.findByTestId('admin.trocas.fee-state')).toHaveTextContent('Paga');
    expect(screen.queryByTestId('admin.trocas.waive-fee')).not.toBeInTheDocument();
    a.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ type: 'x', title: 'x', status: 404 }, 404)).impl);
    const b = renderPanel(<ExchangeCasePage id="zzz" />, 'super_admin');
    expect(await screen.findByTestId('admin.trocas.not-found')).toBeInTheDocument();
    b.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ type: 'x', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<ExchangeCasePage id="e1" />, 'super_admin');
    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });
});
