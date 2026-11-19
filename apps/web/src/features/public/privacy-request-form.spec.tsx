import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyRequestForm } from './privacy-request-form';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const receipt = () => new Response(JSON.stringify({ protocol: 'PV-0031', dueAt: '2026-12-04T12:00:00.000Z' }), { status: 202, headers: { 'content-type': 'application/json' } });

async function fill(email: string, message = '') {
  const user = userEvent.setup();
  render(<PrivacyRequestForm officerEmail="privacidade@webag.com.br" />);
  await user.type(screen.getByTestId('public.excluir.email'), email);
  if (message) await user.type(screen.getByTestId('public.excluir.message'), message);
  await user.click(screen.getByTestId('public.excluir.submit'));
}

describe('formulário de exclusão ao encarregado (WB-214)', () => {
  it('e-mail inválido não envia e explica o formato', async () => {
    await fill('sem-arroba');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Digite o e-mail da conta/)).toBeInTheDocument();
  });

  it('envia com o cabeçalho de cliente, sem cookies, e mostra só o protocolo (não revela se a conta existe)', async () => {
    fetchMock.mockResolvedValue(receipt());
    await fill('ana@exemplo.com', 'Perdi o acesso.');
    const done = await screen.findByTestId('public.excluir.done');
    expect(done).toHaveTextContent('Protocolo PV-0031');
    expect(done).toHaveTextContent('Se existir uma conta com esse e-mail');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/public/privacy-request');
    expect((init as RequestInit).credentials).toBe('omit');
    expect((init as RequestInit).headers).toMatchObject({ 'x-webag-client': 'web' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ type: 'deletion', email: 'ana@exemplo.com', message: 'Perdi o acesso.' });
  });

  it('mostra limite, erro e falta de conexão e deixa tentar de novo', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    await fill('ana@exemplo.com');
    expect(await screen.findByTestId('public.excluir.error')).toHaveTextContent('Muitas tentativas. Tente de novo em 1 hora.');
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByTestId('public.excluir.submit'));
    await waitFor(() => expect(screen.getByTestId('public.excluir.error')).toHaveTextContent('Sem conexão'));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await user.click(screen.getByTestId('public.excluir.submit'));
    await waitFor(() => expect(screen.getByTestId('public.excluir.error')).toHaveTextContent('Não conseguimos enviar agora'));
    expect(screen.getByTestId('public.excluir.email')).toHaveValue('ana@exemplo.com');
  });
});
