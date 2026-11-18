import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ForgotPasswordScreen from '../app/(auth)/forgot-password';
import { ApiError } from '../src/api/problem';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
const mockRequestCode = jest.fn();
const mockReset = jest.fn();
jest.mock('../src/api/auth-api', () => ({
  requestPasswordCode: (...a: unknown[]) => mockRequestCode(...a),
  resetPasswordWithCode: (...a: unknown[]) => mockReset(...a),
}));

beforeEach(() => jest.clearAllMocks());

async function goToCodeStep() {
  mockRequestCode.mockResolvedValue({});
  await renderScreen(<ForgotPasswordScreen />);
  await fireEvent.changeText(screen.getByTestId('auth.reset-email-input'), 'maria@gmail.com');
  await fireEvent.press(screen.getByTestId('auth.reset-send-code'));
  await screen.findByText('Se o e-mail existir, enviamos um código.');
}

async function goToPasswordStep() {
  await goToCodeStep();
  await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '123456');
  await screen.findByTestId('auth.reset-password-input', undefined, { timeout: 2000 });
}

describe('Esqueci a senha (E3)', () => {
  it('3 vistas: e-mail, código e nova senha; entra ao salvar', async () => {
    mockReset.mockResolvedValue(true);
    await goToPasswordStep();
    expect(screen.getByText('Passo 3 de 3')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('auth.reset-password-input'), 'NovaSenha2025');
    await fireEvent.changeText(screen.getByTestId('auth.reset-password-confirm-input'), 'NovaSenha2025');
    await fireEvent.press(screen.getByTestId('auth.reset-submit'));

    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockReset.mock.calls[0]?.[0]).toEqual({ email: 'maria@gmail.com', code: '123456', newPassword: 'NovaSenha2025' });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('a mesma frase aparece para qualquer e-mail (sem revelar se há conta)', async () => {
    await goToCodeStep();
    expect(screen.getByText('Passo 2 de 3')).toBeOnTheScreen();
    expect(mockRequestCode.mock.calls[0]?.[0]).toBe('maria@gmail.com');
  });

  it('código que venceu no passo final volta para o código com a mensagem do design', async () => {
    mockReset.mockRejectedValue(new ApiError({ kind: 'problem', status: 400, code: 'CODE_EXPIRED' }));
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByTestId('auth.reset-password-input'), 'NovaSenha2025');
    await fireEvent.changeText(screen.getByTestId('auth.reset-password-confirm-input'), 'NovaSenha2025');
    await fireEvent.press(screen.getByTestId('auth.reset-submit'));
    expect(await screen.findByText('Esse código venceu. Peça outro.')).toBeOnTheScreen();
    expect(screen.getByText('Passo 2 de 3')).toBeOnTheScreen();
  });

  it('muitos pedidos de código: mensagem de limite', async () => {
    mockRequestCode.mockRejectedValue(new ApiError({ kind: 'problem', status: 429, code: 'RATE_LIMITED' }));
    await renderScreen(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('auth.reset-email-input'), 'maria@gmail.com');
    await fireEvent.press(screen.getByTestId('auth.reset-send-code'));
    expect(await screen.findByText('Muitos pedidos de código. Tente de novo em 40 minutos.')).toBeOnTheScreen();
  });

  it('senhas diferentes: erro ao tocar e nada é enviado', async () => {
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByTestId('auth.reset-password-input'), 'NovaSenha2025');
    await fireEvent.changeText(screen.getByTestId('auth.reset-password-confirm-input'), 'OutraSenha2025');
    await fireEvent.press(screen.getByTestId('auth.reset-submit'));
    expect(await screen.findByText('As senhas não são iguais.')).toBeOnTheScreen();
    expect(mockReset).not.toHaveBeenCalled();
  });
});
