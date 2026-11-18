import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

function problem(status: number, code: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ status, code, title: code }), { status, headers: { 'content-type': 'application/problem+json', ...headers } });
}

async function fillCredentials() {
  await userEvent.type(screen.getByLabelText('E-mail'), 'admin@webag.local');
  await userEvent.type(screen.getByLabelText('Senha'), 'segredo-123');
  await userEvent.click(screen.getByTestId('admin.login.submit'));
}

describe('LoginForm (AC1, AC3)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    search = '';
    replace.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra o selo fixo "Painel administrativo" e não expõe credenciais', () => {
    render(<LoginForm />);
    expect(screen.getByText('Painel administrativo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar no painel' })).toBeInTheDocument();
  });

  it('login errado mostra a mensagem única', async () => {
    fetchMock.mockResolvedValue(problem(401, 'INVALID_CREDENTIALS'));
    render(<LoginForm />);
    await fillCredentials();
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  });

  it('campos vazios mostram o erro ao tocar e não chamam a rede', async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByTestId('admin.login.submit'));
    expect(screen.getByText('Digite seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Digite sua senha.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pede o código do autenticador no passo 2 e entra no 6º dígito', async () => {
    fetchMock.mockResolvedValueOnce(problem(401, 'TOTP_REQUIRED')).mockResolvedValueOnce(new Response(JSON.stringify({ mfaSetupRequired: false }), { status: 200 }));
    render(<LoginForm />);
    await fillCredentials();
    expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Dígito 1 de 6'), '123456');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body).toMatchObject({ email: 'admin@webag.local', totpCode: '123456' });
  });

  it('código errado no passo 2 mostra "Código incorreto ou vencido."', async () => {
    fetchMock.mockResolvedValueOnce(problem(401, 'TOTP_REQUIRED')).mockResolvedValueOnce(problem(401, 'INVALID_CREDENTIALS'));
    render(<LoginForm />);
    await fillCredentials();
    await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '000000');
    expect(await screen.findByText('Código incorreto ou vencido.')).toBeInTheDocument();
  });

  it('abre o fluxo de código de recuperação e a recuperação leva à configuração do 2º fator', async () => {
    fetchMock.mockResolvedValueOnce(problem(401, 'TOTP_REQUIRED')).mockResolvedValueOnce(new Response(JSON.stringify({ mfaSetupRequired: true }), { status: 200 }));
    render(<LoginForm />);
    await fillCredentials();
    await userEvent.click(await screen.findByTestId('admin.login.recovery-link'));
    await userEvent.type(screen.getByLabelText('Código de recuperação'), 'ABCDE-12345');
    await userEvent.click(screen.getByTestId('admin.recovery.submit'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/verificacao'));
  });

  it('espera por tentativas mostra o horário, não contagem regressiva', async () => {
    fetchMock.mockResolvedValue(problem(429, 'RATE_LIMITED', { 'retry-after': '900' }));
    render(<LoginForm />);
    await fillCredentials();
    const notice = await screen.findByTestId('admin.login.blocked');
    expect(notice).toHaveTextContent(/Muitas tentativas\. Tente de novo às \d{2}:\d{2}/);
  });

  it('volta à última página depois de expirar por inatividade e ignora destino externo', async () => {
    search = 'motivo=inatividade&next=%2Fadmin%2Fparametros';
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ mfaSetupRequired: false }), { status: 200 }));
    render(<LoginForm />);
    expect(screen.getByText('Sua sessão terminou por inatividade.')).toBeInTheDocument();
    await fillCredentials();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/parametros'));
  });

  it('nunca grava a senha em storage', async () => {
    fetchMock.mockResolvedValue(problem(401, 'INVALID_CREDENTIALS'));
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    render(<LoginForm />);
    await fillCredentials();
    await screen.findByText('E-mail ou senha incorretos.');
    expect(spy).not.toHaveBeenCalled();
  });
});
