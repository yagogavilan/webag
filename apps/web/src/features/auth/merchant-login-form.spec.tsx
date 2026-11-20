import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MerchantLoginForm } from './merchant-login-form';

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), useSearchParams: () => new URLSearchParams(search) }));

const problem = (status: number, code: string) => new Response(JSON.stringify({ status, code, title: code }), { status, headers: { 'content-type': 'application/problem+json' } });

async function fill() {
  await userEvent.type(screen.getByLabelText('E-mail'), 'marcos@casabela.com.br');
  await userEvent.type(screen.getByLabelText('Senha'), 'segredo-123');
  await userEvent.click(screen.getByTestId('lojista.login.submit'));
}

describe('MerchantLoginForm (E7)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    search = '';
    replace.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('não mostra o selo do admin e oferece cadastro e recuperação de senha', () => {
    render(<MerchantLoginForm />);
    expect(screen.queryByText('Painel administrativo')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar no painel da loja' })).toBeInTheDocument();
    expect(screen.getByTestId('lojista.login.signup-link')).toHaveTextContent('Quero cadastrar minha loja');
    expect(screen.getByTestId('lojista.login.forgot-password')).toHaveAttribute('href', '/lojista/esqueci-a-senha');
  });

  it('campos vazios mostram o erro ao tocar e não chamam a rede', async () => {
    render(<MerchantLoginForm />);
    await userEvent.click(screen.getByTestId('lojista.login.submit'));
    expect(screen.getByText('Digite seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Digite sua senha.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('senha errada mostra a mensagem única', async () => {
    fetchMock.mockResolvedValue(problem(401, 'INVALID_CREDENTIALS'));
    render(<MerchantLoginForm />);
    await fill();
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  });

  it('entra pela sessão do lojista e vai ao painel; ignora destino fora da área', async () => {
    search = 'next=https://evil.com';
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ mfaSetupRequired: false }), { status: 200, headers: { 'content-type': 'application/json' } }));
    render(<MerchantLoginForm />);
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lojista'));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/session/lojista/login');
  });

  it('volta ao destino seguro depois de sessão expirada', async () => {
    search = 'motivo=expirada&next=/lojista/equipe';
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    render(<MerchantLoginForm />);
    expect(screen.getByTestId('lojista.login.notice')).toHaveTextContent('Entre de novo para continuar.');
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lojista/equipe'));
  });

  it('muitas falhas pedem o código enviado por e-mail', async () => {
    fetchMock.mockResolvedValueOnce(problem(403, 'LOGIN_CODE_REQUIRED'));
    render(<MerchantLoginForm />);
    await fill();
    expect(await screen.findByRole('heading', { name: 'Confirme que é você' })).toBeInTheDocument();
  });
});
