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

  const challenge = () => new Response(JSON.stringify({ mfaRequired: true }), { status: 200 });
  const sessionOk = (mfaSetupRequired = false) => new Response(JSON.stringify({ mfaSetupRequired }), { status: 200 });
  const call = (n: number) => ({ url: String(fetchMock.mock.calls[n]![0]), body: JSON.parse((fetchMock.mock.calls[n]![1] as RequestInit).body as string) });

  it('2 passos: senha certa abre o passo do código e o código segue para /mfa sem repetir a senha (SEC-115)', async () => {
    fetchMock.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(sessionOk());
    render(<LoginForm />);
    await fillCredentials();
    expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Dígito 1 de 6'), '123456');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
    expect(call(0).url).toBe('/api/session/admin/login');
    expect(call(0).body).toEqual({ email: 'admin@webag.local', password: 'segredo-123' });
    expect(call(1).url).toBe('/api/session/admin/mfa');
    expect(call(1).body).toEqual({ code: '123456' });
  });

  it('código errado no passo 2 mostra "Código incorreto ou vencido."', async () => {
    fetchMock.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(problem(401, 'MFA_INVALID'));
    render(<LoginForm />);
    await fillCredentials();
    await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '000000');
    expect(await screen.findByText('Código incorreto ou vencido.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('muitas tentativas no 2º fator mostram o horário no próprio passo', async () => {
    fetchMock.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(problem(429, 'MFA_RATE_LIMITED', { 'retry-after': '900' }));
    render(<LoginForm />);
    await fillCredentials();
    await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '000000');
    expect(await screen.findByText(/Muitas tentativas\. Tente de novo às \d{2}:\d{2}/)).toBeInTheDocument();
  });

  it('código de recuperação usa o mesmo 2º passo e leva à configuração do 2º fator', async () => {
    fetchMock.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(sessionOk(true));
    render(<LoginForm />);
    await fillCredentials();
    await userEvent.click(await screen.findByTestId('admin.login.recovery-link'));
    await userEvent.type(screen.getByLabelText('Código de recuperação'), 'ABCDE-12345');
    await userEvent.click(screen.getByTestId('admin.recovery.submit'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/verificacao'));
    expect(call(1)).toEqual({ url: '/api/session/admin/mfa', body: { code: 'ABCDE-12345' } });
  });

  it('admin com muitas falhas: código do e-mail no login e depois o 2º fator', async () => {
    fetchMock.mockResolvedValueOnce(problem(403, 'LOGIN_CODE_REQUIRED')).mockResolvedValueOnce(challenge()).mockResolvedValueOnce(sessionOk());
    render(<LoginForm />);
    await fillCredentials();
    await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '654321');
    expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument();
    expect(call(1).body).toEqual({ email: 'admin@webag.local', password: 'segredo-123', code: '654321' });
    await userEvent.type(screen.getByLabelText('Dígito 1 de 6'), '123456');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
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
