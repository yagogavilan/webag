import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { HelpAdminPage } from './help-page';
import { ContentReportsPage } from './reports-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/denuncias' }));
afterEach(() => vi.unstubAllGlobals());

const queueRow = (over: object = {}) => ({ targetType: 'review', targetId: 'rv1', title: 'Avaliação de 1 estrela', excerpt: 'Produto ruim', reasons: ['offensive'], reports: 2, oldestAt: '2026-11-17T12:00:00Z', overdue: true, available: true, ...over });
const reportCase = (over: object = {}) => ({ ...queueRow(), reports: [{ reason: 'offensive', text: 'Tem xingamento', reporter: 'Cliente', reportedAt: '2026-11-17T12:00:00Z', status: 'open' }], ...over });

describe('moderação de denúncias (WB-124)', () => {
  it('lista com atraso em texto; manter é a ação principal; remover pede o motivo', async () => {
    const calls: string[] = [];
    let removeBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/admin/content-reports/review/rv1/remove')) {
          removeBody = JSON.parse(String(init.body));
          return json({ status: 'removed' });
        }
        if (url.pathname.endsWith('/admin/content-reports/review/rv1/keep')) {
          calls.push('keep');
          return json({ status: 'kept' });
        }
        if (url.pathname.endsWith('/admin/content-reports/review/rv1')) return json(reportCase());
        if (url.pathname.endsWith('/admin/content-reports')) return json({ data: [queueRow()], nextCursor: null });
        return undefined;
      }).impl,
    );
    renderPanel(<ContentReportsPage />, 'operations');
    expect(await screen.findByTestId('admin.denuncias.overdue-badge')).toHaveTextContent('Atrasado');
    await userEvent.click(screen.getByTestId('admin.denuncias.row-rv1'));
    expect(await screen.findByText('Não removemos avaliação só por ser negativa.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.denuncias.remove'));
    await userEvent.click(screen.getByTestId('admin.denuncias.remove-confirm'));
    expect(await screen.findByText('Escolha o motivo.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.denuncias.remove-reason-offense'));
    await userEvent.click(screen.getByTestId('admin.denuncias.remove-confirm'));
    await waitFor(() => expect(removeBody).toEqual({ reasonCode: 'offense' }));
  });

  it('manter encerra; caso já tratado mostra o aviso; produto encaminha para a moderação', async () => {
    let keepStatus = 200;
    vi.stubGlobal(
      'fetch',
      mockFetch((url) => {
        if (url.pathname.endsWith('/keep')) return keepStatus === 200 ? json({ status: 'kept' }) : json({ type: 'x', title: 'x', status: 409 }, 409);
        if (url.pathname.includes('/admin/content-reports/review/rv1')) return json(reportCase());
        if (url.pathname.endsWith('/admin/content-reports')) return json({ data: [queueRow()], nextCursor: null });
        return undefined;
      }).impl,
    );
    renderPanel(<ContentReportsPage />, 'super_admin');
    await userEvent.click(await screen.findByTestId('admin.denuncias.row-rv1'));
    keepStatus = 409;
    await userEvent.click(await screen.findByTestId('admin.denuncias.keep'));
    expect(await screen.findByTestId('admin.denuncias.error')).toHaveTextContent('Esta denúncia já foi tratada.');
  });

  it('vazio e sem acesso do suporte', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/content-reports') ? json({ data: [], nextCursor: null }) : undefined)).impl);
    const a = renderPanel(<ContentReportsPage />, 'operations');
    expect(await screen.findByTestId('admin.denuncias.empty')).toBeInTheDocument();
    a.unmount();
    renderPanel(<ContentReportsPage />, 'support');
    expect(screen.getByText(/acesso/i)).toBeInTheDocument();
  });
});

describe('ajuda editável (WB-034)', () => {
  const faq = (over: object = {}) => ({ id: 'f1', audience: 'customer', group: 'order', question: 'Onde vejo meu pedido?', answer: 'Em Pedidos.', published: true, position: 0, ...over });

  it('lista as perguntas do público, publica e despublica', async () => {
    let patched: unknown = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/admin/help/faqs/f1') && init.method === 'PATCH') {
          patched = JSON.parse(String(init.body));
          return json(faq({ published: false }));
        }
        if (url.pathname.endsWith('/admin/help/faqs')) return json({ data: [faq(), faq({ id: 'f2', audience: 'merchant', group: 'orders', question: 'Como aceito um pedido?' })] });
        return undefined;
      }).impl,
    );
    renderPanel(<HelpAdminPage />, 'operations');
    expect(await screen.findByText('Onde vejo meu pedido?')).toBeInTheDocument();
    expect(screen.queryByText('Como aceito um pedido?')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.ajuda.faq-f1-switch'));
    await waitFor(() => expect(patched).toEqual({ published: false }));
    await userEvent.click(screen.getByTestId('admin.ajuda.tab-merchant'));
    expect(await screen.findByText('Como aceito um pedido?')).toBeInTheDocument();
  });

  it('vazio oferece nova pergunta; suporte não acessa', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/help/faqs') ? json({ data: [] }) : undefined)).impl);
    const a = renderPanel(<HelpAdminPage />, 'super_admin');
    expect(await screen.findByTestId('admin.ajuda.empty')).toBeInTheDocument();
    a.unmount();
    renderPanel(<HelpAdminPage />, 'support');
    expect(screen.getByText(/acesso/i)).toBeInTheDocument();
  });
});
