import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deadlineText } from '@/lib/api/admin-privacy';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { PrivacyRequestsPage } from './requests-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/titulares' }));
afterEach(() => vi.unstubAllGlobals());

const row = (over: object = {}) => ({ id: 'p1', protocol: 'LGPD-0001', type: 'access', channel: 'form', status: 'new', requester: 'm***@dominio.com', receivedAt: '2026-11-10T12:00:00Z', dueAt: '2026-11-25T12:00:00Z', daysLeft: 6, overdue: false, hasAccount: true, ...over });
const detail = (over: object = {}) => ({ ...row(), messagePreview: 'Quero saber...', history: [{ action: 'opened', at: '2026-11-10T12:00:00Z', note: null }], answer: null, ...over });

describe('pedidos de titulares (WB-217)', () => {
  it('prazo sempre em texto', () => {
    expect(deadlineText({ daysLeft: 5, overdue: false, status: 'new' })).toBe('Vence em 5 dias');
    expect(deadlineText({ daysLeft: 0, overdue: false, status: 'new' })).toBe('Vence hoje');
    expect(deadlineText({ daysLeft: -2, overdue: true, status: 'in_progress' })).toBe('Atrasado há 2 dias');
    expect(deadlineText({ daysLeft: 3, overdue: false, status: 'answered' })).toBe('Respondida');
  });

  it('só o super admin vê; outro perfil recebe "sem acesso"', () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ data: [], nextCursor: null })).impl);
    renderPanel(<PrivacyRequestsPage />, 'operations');
    expect(screen.getByText(/acesso/i)).toBeInTheDocument();
  });

  it('lista com o e-mail mascarado; revelar exige motivo e vai à auditoria; resposta exige texto e confirmação', async () => {
    let revealBody: unknown = null;
    let answered: unknown = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/admin/privacy-requests/p1/reveal') && init.method === 'POST') {
          revealBody = JSON.parse(String(init.body));
          return json({ email: 'maria@dominio.com', message: 'Quero saber que dados vocês têm.' });
        }
        if (url.pathname.endsWith('/admin/privacy-requests/p1/answer') && init.method === 'POST') {
          answered = JSON.parse(String(init.body));
          return json(detail({ status: 'answered', answer: 'Segue o resumo.' }));
        }
        if (url.pathname.endsWith('/admin/privacy-requests/p1')) return json(detail());
        if (url.pathname.endsWith('/admin/privacy-requests')) return json({ data: [row()], nextCursor: null });
        return undefined;
      }).impl,
    );
    renderPanel(<PrivacyRequestsPage />, 'super_admin');
    expect(await screen.findByTestId('admin.titulares.row-p1')).toHaveTextContent('m***@dominio.com');
    expect(screen.getByTestId('admin.titulares.deadline-p1')).toHaveTextContent('Vence em 6 dias');
    await userEvent.click(screen.getByTestId('admin.titulares.row-p1'));
    expect(await screen.findByTestId('admin.titulares.requester')).toHaveTextContent('m***@dominio.com');
    await userEvent.click(screen.getByTestId('admin.titulares.reveal'));
    await userEvent.click(screen.getByTestId('confirm'));
    expect(await screen.findByText(/Escreva o motivo/)).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('reason-input'), 'Responder o pedido de acesso');
    await userEvent.click(screen.getByTestId('confirm'));
    await waitFor(() => expect(screen.getByTestId('admin.titulares.requester')).toHaveTextContent('maria@dominio.com'));
    expect(revealBody).toEqual({ reason: 'Responder o pedido de acesso' });
    await userEvent.click(screen.getByTestId('admin.titulares.send-answer'));
    expect(await screen.findByText('Escreva a resposta.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.titulares.answer-input'), 'Segue o resumo dos seus dados.');
    await userEvent.click(screen.getByTestId('admin.titulares.send-answer'));
    await userEvent.click(await screen.findByTestId('admin.titulares.send-confirm'));
    await waitFor(() => expect(answered).toEqual({ answer: 'Segue o resumo dos seus dados.' }));
  });

  it('vazio, erro e registro de pedido recebido por e-mail', async () => {
    let registered: unknown = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/admin/privacy-requests') && init.method === 'POST') {
          registered = JSON.parse(String(init.body));
          return json({ protocol: 'LGPD-0009', dueAt: '2026-12-04T12:00:00Z' });
        }
        if (url.pathname.endsWith('/admin/privacy-requests')) return json({ data: [], nextCursor: null });
        return undefined;
      }).impl,
    );
    const a = renderPanel(<PrivacyRequestsPage />, 'super_admin');
    expect(await screen.findByTestId('admin.titulares.empty')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.titulares.new-request'));
    await userEvent.click(screen.getByTestId('admin.titulares.register-submit'));
    expect(await screen.findByText('Confira o e-mail.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.titulares.register-email'), 'joao@dominio.com');
    await userEvent.click(screen.getByTestId('admin.titulares.register-submit'));
    await waitFor(() => expect(registered).toMatchObject({ type: 'access', email: 'joao@dominio.com' }));
    a.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ type: 'x', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<PrivacyRequestsPage />, 'super_admin');
    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });
});
