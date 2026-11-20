import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import LoginScreen from '../app/(auth)/login';
import { ApiError } from '../src/api/problem';
import { formatClock } from '../src/lib/format';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
const mockSignIn = jest.fn();
jest.mock('../src/api/auth-api', () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
jest.mock('../src/lib/minDuration', () => ({ withMinDuration: <T,>(p: Promise<T>) => p }));

async function submitWith(email: string, password: string) {
  await fireEvent.changeText(screen.getByTestId('auth.login-email-input'), email);
  await fireEvent.changeText(screen.getByTestId('auth.login-password-input'), password);
  await fireEvent.press(screen.getByTestId('auth.login-submit'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('Entrar (E2)', () => {
  it('entra em 1 passo e volta ao ponto de origem', async () => {
    mockParams = { returnTo: '/favoritos' };
    mockSignIn.mockResolvedValue(undefined);
    await renderScreen(<LoginScreen />);
    await submitWith('maria@gmail.com', 'Cachorro2024');

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/favoritos'));
    expect(mockSignIn.mock.calls[0]?.[0]).toEqual({ email: 'maria@gmail.com', password: 'Cachorro2024' });
  });

  it('ignora returnTo externo e vai para o início', async () => {
    mockParams = { returnTo: 'https://evil.example/phish' };
    mockSignIn.mockResolvedValue(undefined);
    await renderScreen(<LoginScreen />);
    await submitWith('maria@gmail.com', 'Cachorro2024');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('credencial errada: mensagem única, e-mail e senha continuam no campo', async () => {
    mockSignIn.mockRejectedValue(new ApiError({ kind: 'problem', status: 401, code: 'INVALID_CREDENTIALS' }));
    await renderScreen(<LoginScreen />);
    await submitWith('maria@gmail.com', 'errada123');

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeOnTheScreen();
    expect(screen.getByTestId('auth.login-password-input').props.value).toBe('errada123');
    expect(screen.getByTestId('auth.login-email-input').props.value).toBe('maria@gmail.com');
  });

  it('botão ativo: vazio mostra os erros ao tocar', async () => {
    await renderScreen(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('auth.login-submit'));
    expect(await screen.findByText('Confira o e-mail.')).toBeOnTheScreen();
    expect(screen.getByText('Digite sua senha.')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('step-up: 403 LOGIN_CODE_REQUIRED abre o código com e-mail mascarado e entra com o código', async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError({ kind: 'problem', status: 403, code: 'LOGIN_CODE_REQUIRED' }));
    await renderScreen(<LoginScreen />);
    await submitWith('maria@gmail.com', 'Cachorro2024');

    expect(await screen.findByText('Vimos várias tentativas de entrar na sua conta. Enviamos um código para m***@gmail.com.')).toBeOnTheScreen();

    mockSignIn.mockResolvedValueOnce(undefined);
    await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '123456');
    await waitFor(() => expect(mockSignIn).toHaveBeenLastCalledWith({ email: 'maria@gmail.com', password: 'Cachorro2024', code: '123456' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'), { timeout: 2000 });
  });

  it('muitas tentativas: mostra o horário (não contagem), inerte com o motivo e atalho para redefinir', async () => {
    mockSignIn.mockRejectedValue(new ApiError({ kind: 'problem', status: 429, code: 'RATE_LIMITED', retryAfter: 900 }));
    const before = Date.now();
    await renderScreen(<LoginScreen />);
    await submitWith('maria@gmail.com', 'errada123');

    const clock = formatClock(before + 900_000);
    expect(await screen.findByTestId('auth.login-wait-banner')).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`Tente de novo às \\d\\d:\\d\\d ou redefina a senha`))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: new RegExp(`Tente às ${clock.slice(0, 3)}`) })).toBeDisabled();
    await fireEvent.press(screen.getByTestId('auth.login-reset-from-wait'));
    expect(mockRouter.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('conta bloqueada: tela própria sem revelar o motivo', async () => {
    mockSignIn.mockRejectedValue(new ApiError({ kind: 'problem', status: 403, code: 'ACCOUNT_BLOCKED' }));
    await renderScreen(<LoginScreen />);
    await submitWith('maria@gmail.com', 'Cachorro2024');
    expect(await screen.findByText('Conta indisponível')).toBeOnTheScreen();
    expect(screen.getByText('Fale com o suporte para entender o motivo.')).toBeOnTheScreen();
  });

  it('falha de rede: banner com ação de tentar de novo e campos preservados', async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError({ kind: 'network' }));
    await renderScreen(<LoginScreen />);
    await submitWith('maria@gmail.com', 'Cachorro2024');
    expect(await screen.findByText('Não conseguimos entrar agora. Tente de novo.')).toBeOnTheScreen();

    mockSignIn.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });
});
