import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionFlow } from './account-deletion-flow';
import { CancelDeletionPublic } from './cancel-deletion-public';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const TICKET = 't'.repeat(43);
const REVIEW = { canDelete: true, blockers: [], ownsStore: false, anonymizationDays: 30, fiscalRetentionYears: 5, regretHours: 72 };
const T = (id: string) => screen.getByTestId(`public.excluir.${id}`);
const lastBody = () => JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body));
const lastUrl = () => String(fetchMock.mock.calls.at(-1)![0]);

describe('exclusão de conta sem o app (SEC-166)', () => {
  it('via A: e-mail, código, revisão e confirmação; o resultado mostrado vem do servidor e o ticket não vai a nenhuma URL', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(reply(200, { sent: true }))
      .mockResolvedValueOnce(reply(200, { deleteTicket: TICKET, expiresIn: 600 }))
      .mockResolvedValueOnce(reply(200, REVIEW))
      .mockResolvedValueOnce(reply(200, { status: 'pending', effectiveAt: '2026-11-22T15:00:00.000Z', cancelableUntil: '2026-11-22T15:00:00.000Z' }));
    render(<AccountDeletionFlow />);
    await user.type(T('email-input'), 'ana@exemplo.com');
    await user.click(T('send-code'));
    expect(await screen.findByTestId('public.excluir.notice')).toHaveTextContent('Se existir uma conta com esse e-mail, enviamos um código');
    expect(lastBody()).toEqual({ email: 'ana@exemplo.com' });
    expect(lastUrl()).toBe('/api/public/account-deletion/start');

    await user.type(screen.getByLabelText('Dígito 1 de 6'), '482913');
    expect(await screen.findByTestId('public.excluir.delete-submit')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(['/api/public/account-deletion/start', '/api/public/account-deletion/verify-code', '/api/public/account-deletion/review']);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(TICKET))).toBe(false);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({ 'x-webag-client': 'web' });

    await user.click(T('delete-submit'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(T('delete-confirm'));
    expect(await screen.findByTestId('public.excluir.done')).toHaveTextContent('Sua conta foi fechada');
    expect(lastBody()).toEqual({ deleteTicket: TICKET });
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it('via B: senha certa em conta sob ataque recebe o código na própria resposta 403 (SEC-176, W.2) e não chama `start` de novo', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(reply(403, { code: 'LOGIN_CODE_REQUIRED' }))
      .mockResolvedValueOnce(reply(200, { deleteTicket: TICKET, expiresIn: 600 }))
      .mockResolvedValueOnce(reply(200, REVIEW));
    render(<AccountDeletionFlow />);
    await user.click(T('use-password'));
    await user.type(T('email-input'), 'ana@exemplo.com');
    await user.type(T('password-input'), 'senha-certa');
    await user.click(T('password-submit'));
    expect(await screen.findByTestId('public.excluir.notice')).toHaveTextContent('Por segurança, enviamos um código');
    expect(fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)))).toEqual([{ email: 'ana@exemplo.com', password: 'senha-certa' }]);
    await user.type(screen.getByLabelText('Dígito 1 de 6'), '111222');
    expect(await screen.findByTestId('public.excluir.delete-submit')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)))[1]).toEqual({ email: 'ana@exemplo.com', code: '111222' });
    expect(lastBody()).toEqual({ deleteTicket: TICKET });
  });

  it('e-mail ou senha incorretos têm uma só mensagem; código errado limpa o campo; limite e falta de conexão são avisados', async () => {
    const user = userEvent.setup();
    render(<AccountDeletionFlow />);
    await user.click(T('use-password'));
    await user.type(T('email-input'), 'ana@exemplo.com');
    await user.type(T('password-input'), 'errada');
    fetchMock.mockResolvedValueOnce(reply(401, { code: 'INVALID_CREDENTIALS' }));
    await user.click(T('password-submit'));
    expect(await screen.findByTestId('public.excluir.error')).toHaveTextContent('E-mail ou senha incorretos.');
    fetchMock.mockResolvedValueOnce(reply(429, {}, { 'retry-after': '3600' }));
    await user.click(T('password-submit'));
    await waitFor(() => expect(T('error')).toHaveTextContent('Muitas tentativas. Tente de novo em 1 hora.'));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(T('password-submit'));
    await waitFor(() => expect(T('error')).toHaveTextContent('Sem conexão'));
  });

  it('com pedido em andamento mostra os bloqueios e não oferece o botão de excluir', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(reply(200, { sent: true }))
      .mockResolvedValueOnce(reply(200, { deleteTicket: TICKET, expiresIn: 600 }))
      .mockResolvedValueOnce(reply(200, { ...REVIEW, canDelete: false, blockers: [{ kind: 'order', id: 'o1', number: '4821', status: 'saiu para entrega' }] }));
    render(<AccountDeletionFlow />);
    await user.type(T('email-input'), 'ana@exemplo.com');
    await user.click(T('send-code'));
    await user.type(await screen.findByLabelText('Dígito 1 de 6'), '482913');
    expect(await screen.findByTestId('public.excluir.blockers')).toHaveTextContent('Pedido #4821 · saiu para entrega');
    expect(screen.queryByTestId('public.excluir.delete-submit')).not.toBeInTheDocument();
  });

  it('validação do e-mail não chama a API', async () => {
    const user = userEvent.setup();
    render(<AccountDeletionFlow />);
    await user.type(T('email-input'), 'sem-arroba');
    await user.click(T('send-code'));
    expect(screen.getByText(/como nome@exemplo.com/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('desistir da exclusão na página pública (SEC-176)', () => {
  it('conta sob ataque: 403 abre o campo de código e o reenvio leva e-mail, senha e code', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(reply(403, { code: 'LOGIN_CODE_REQUIRED' })).mockResolvedValueOnce(reply(204));
    render(<CancelDeletionPublic />);
    await user.type(screen.getByTestId('public.excluir.cancel-email'), 'ana@exemplo.com');
    await user.type(screen.getByTestId('public.excluir.cancel-password'), 'senha-certa');
    await user.click(screen.getByTestId('public.excluir.cancel-submit'));
    expect(await screen.findByTestId('public.excluir.cancel-code-step')).toHaveTextContent('enviamos um código de 6 dígitos');
    await user.type(screen.getByLabelText('Dígito 1 de 6'), '482913');
    expect(await screen.findByTestId('public.excluir.cancel-done')).toBeInTheDocument();
    expect(lastBody()).toEqual({ email: 'ana@exemplo.com', password: 'senha-certa', code: '482913' });
    expect(lastUrl()).toBe('/api/public/account-deletion/cancel');
  });

  it('senha errada ou prazo vencido dão a mesma mensagem; sem código completo não reenvia', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(reply(401, { code: 'INVALID_CREDENTIALS' }));
    render(<CancelDeletionPublic />);
    await user.click(screen.getByTestId('public.excluir.cancel-submit'));
    expect(screen.getByText('Digite a sua senha.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(screen.getByTestId('public.excluir.cancel-email'), 'ana@exemplo.com');
    await user.type(screen.getByTestId('public.excluir.cancel-password'), 'errada');
    await user.click(screen.getByTestId('public.excluir.cancel-submit'));
    expect(await screen.findByTestId('public.excluir.cancel-error')).toHaveTextContent('Se o prazo para desistir já passou');
  });
});
