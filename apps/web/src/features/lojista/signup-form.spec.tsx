import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { json, mockFetch } from '../../../test/render';
import { SignupForm } from './signup-form';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }), useSearchParams: () => new URLSearchParams('') }));

const T = (id: string) => screen.getByTestId(`lojista.signup.${id}`);

const legal = (type: string) => json({ id: 'd', type, version: type === 'merchant_terms' ? 2 : 1, title: 't', content: 'c', effectiveAt: '2026-01-01T00:00:00Z', relevantChange: false, createdAt: '2026-01-01T00:00:00Z' });

async function fillAll(over: { password?: string; confirm?: string } = {}) {
  await userEvent.type(T('name-input'), 'Marcos Silva');
  await userEvent.type(T('email-input'), 'marcos@casabela.com.br');
  await userEvent.type(T('phone-input'), '11999998888');
  await userEvent.type(T('password-input'), over.password ?? 'Casa-bela-2026');
  await userEvent.type(T('password-confirm-input'), over.confirm ?? over.password ?? 'Casa-bela-2026');
  await userEvent.click(T('terms-checkbox'));
}

function setup(open = true, handlers: Parameters<typeof mockFetch> = []) {
  const { impl, calls } = mockFetch(
    (url) => (url.pathname.includes('/legal/') ? legal(url.pathname.split('/').pop() ?? '') : undefined),
    ...handlers,
  );
  vi.stubGlobal('fetch', impl);
  render(
    <ToastProvider>
      <SignupForm signupOpen={open} />
    </ToastProvider>,
  );
  return calls;
}

describe('SignupForm (L1)', () => {
  beforeEach(() => {
    replace.mockReset();
    push.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('botão ativo: ao tocar vazio mostra os erros por campo e o resumo, sem chamar a API', async () => {
    const calls = setup();
    await userEvent.click(T('submit'));
    expect(screen.getByText('Digite seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Confira o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Confira o celular com DDD.')).toBeInTheDocument();
    expect(screen.getByText('Senha fraca. Use 8 caracteres ou mais, com letras e números.')).toBeInTheDocument();
    expect(screen.getByText('Marque a caixa para continuar.')).toBeInTheDocument();
    expect(T('error-summary')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(T('name-input')).toHaveFocus();
  });

  it('máscara de celular, sugestão de domínio e confirmação de senha', async () => {
    setup();
    await userEvent.type(T('phone-input'), '11999998888');
    expect(T('phone-input')).toHaveValue('(11) 99999-8888');
    await userEvent.type(T('email-input'), 'ana@gmial.com');
    expect(screen.getByText('Quis dizer gmail.com?')).toBeInTheDocument();
    await userEvent.type(T('password-input'), 'Casa-bela-2026');
    await userEvent.type(T('password-confirm-input'), 'outra');
    await userEvent.tab();
    expect(screen.getByText('As senhas não são iguais.')).toBeInTheDocument();
  });

  it('cria a conta, confirma o código e abre o cadastro da loja com o aceite dos Termos do lojista', async () => {
    const calls = setup(true, [
      (url) => (url.pathname === '/api/session/lojista/register' ? json({ emailVerified: false }, 201) : undefined),
      (url) => (url.pathname.endsWith('/auth/email/verify') ? json(null, 204) : undefined),
      (url) => (url.pathname.endsWith('/me/merchant-role') ? json(null, 204) : undefined),
    ]);
    await fillAll();
    await userEvent.click(T('submit'));
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument();
    expect(screen.getByText('Enviamos um código de 6 dígitos para marcos@casabela.com.br.')).toBeInTheDocument();

    const register = calls.find((c) => c.url.pathname === '/api/session/lojista/register');
    const sent = JSON.parse(String(register?.init.body));
    expect(sent.adultDeclaration).toBe(true);
    expect(sent.acceptedDocuments.map((d: { type: string }) => d.type).sort()).toEqual(['customer_terms', 'privacy']);

    await userEvent.type(screen.getByLabelText('Dígito 1 de 6'), '123456');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lojista/onboarding/1'));
    const role = calls.find((c) => c.url.pathname.endsWith('/me/merchant-role'));
    expect(JSON.parse(String(role?.init.body))).toEqual({ acceptedDocuments: [{ type: 'merchant_terms', version: 2 }] });
  });

  it('e-mail que já é de cliente: erro no campo e botão "Entrar e abrir minha loja"', async () => {
    setup(true, [(url) => (url.pathname === '/api/session/lojista/register' ? json({ code: 'EMAIL_ALREADY_REGISTERED', title: 'x', status: 409 }, 409) : undefined)]);
    await fillAll();
    await userEvent.click(T('submit'));
    expect(await screen.findByText('Esse e-mail já tem conta Webag.')).toBeInTheDocument();
    await userEvent.click(T('existing-login'));
    expect(push).toHaveBeenCalledWith('/lojista/entrar?email=marcos%40casabela.com.br');
  });

  it('código errado mostra as tentativas que restam e limpa as caixas', async () => {
    setup(true, [
      (url) => (url.pathname === '/api/session/lojista/register' ? json({ emailVerified: false }, 201) : undefined),
      (url) => (url.pathname.endsWith('/auth/email/verify') ? json({ code: 'CODE_INVALID', title: 'x', status: 400 }, 400) : undefined),
    ]);
    await fillAll();
    await userEvent.click(T('submit'));
    await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '000000');
    expect(await screen.findByText('Código incorreto. Restam 4 tentativas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Dígito 1 de 6')).toHaveValue('');
  });

  it('flag desligada: lista de espera só com o consentimento marcado', async () => {
    const calls = setup(false, [(url) => (url.pathname.endsWith('/waitlist') ? json(null, 204) : undefined)]);
    expect(screen.getByText('Cadastro de lojas indisponível')).toBeInTheDocument();
    await userEvent.type(T('waitlist-email-input'), 'marcos@casabela.com.br');
    await userEvent.click(T('waitlist-submit'));
    expect(screen.getByText('Marque a caixa para continuar.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/waitlist'))).toBe(false);
    await userEvent.click(screen.getByLabelText('Quero receber um aviso por e-mail quando o cadastro abrir.'));
    await userEvent.click(T('waitlist-submit'));
    expect(await screen.findByText('Anotado. Avisamos por e-mail.')).toBeInTheDocument();
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/waitlist'))?.init.body))).toMatchObject({ kind: 'merchant_signup', consent: true });
  });
});
