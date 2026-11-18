import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import SignupScreen from '../app/(auth)/signup';
import { ApiError } from '../src/api/problem';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));
const mockSignUp = jest.fn();
jest.mock('../src/api/auth-api', () => ({ signUp: (...args: unknown[]) => mockSignUp(...args) }));

async function fillValid() {
  await fireEvent.changeText(screen.getByTestId('auth.signup-name-input'), 'Maria Souza');
  await fireEvent.changeText(screen.getByTestId('auth.signup-email-input'), 'maria@gmail.com');
  await fireEvent.changeText(screen.getByTestId('auth.signup-phone-input'), '11999998888');
  await fireEvent.changeText(screen.getByTestId('auth.password-input'), 'Cachorro2024');
  await fireEvent.changeText(screen.getByTestId('auth.password-confirm-input'), 'Cachorro2024');
  await fireEvent.press(screen.getByTestId('auth.terms-checkbox'));
}

beforeEach(() => jest.clearAllMocks());

describe('Criar conta (E1)', () => {
  it('botão ativo: ao tocar vazio mostra os erros do design e não envia', async () => {
    await renderScreen(<SignupScreen />);
    await fireEvent.press(screen.getByTestId('auth.signup-submit'));

    expect(await screen.findByText('Digite seu nome.')).toBeOnTheScreen();
    expect(screen.getByText('Confira o e-mail.')).toBeOnTheScreen();
    expect(screen.getByText('Confira o celular com DDD.')).toBeOnTheScreen();
    expect(screen.getByText('Senha fraca. Use 8 caracteres ou mais, com letras e números.')).toBeOnTheScreen();
    expect(screen.getByText('Marque a caixa para continuar.')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('mostra o medidor de força e avisa quando as senhas não são iguais', async () => {
    await renderScreen(<SignupScreen />);
    await fireEvent.changeText(screen.getByTestId('auth.password-input'), 'Cachorro-Azul-2024!');
    expect(screen.getByText('Forte')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('auth.password-confirm-input'), 'Cachorro-Azul-2024?');
    expect(await screen.findByText('As senhas não são iguais.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('auth.password-confirm-input'), 'Cachorro-Azul-2024!');
    expect(await screen.findByText('As senhas são iguais.')).toBeOnTheScreen();
  });

  it('sugere o domínio do e-mail e aplica a sugestão', async () => {
    await renderScreen(<SignupScreen />);
    const email = screen.getByTestId('auth.signup-email-input');
    await fireEvent.changeText(email, 'ana@gmial.com');
    await fireEvent(email, 'blur');
    expect(await screen.findByText('Você quis dizer gmail.com?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('auth.signup-email-suggestion-accept'));
    await waitFor(() => expect(screen.getByTestId('auth.signup-email-input').props.value).toBe('ana@gmail.com'));
  });

  it('cria a conta com dados válidos, aceite dos termos e volta para o início', async () => {
    mockSignUp.mockResolvedValue(undefined);
    await renderScreen(<SignupScreen />);
    await fillValid();
    await fireEvent.press(screen.getByTestId('auth.signup-submit'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockSignUp.mock.calls[0]?.[0]).toEqual({ name: 'Maria Souza', email: 'maria@gmail.com', phone: '(11) 99999-8888', password: 'Cachorro2024' });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('e-mail já cadastrado: mensagem única e atalho para Entrar', async () => {
    mockSignUp.mockRejectedValue(new ApiError({ kind: 'problem', status: 409, code: 'EMAIL_ALREADY_REGISTERED' }));
    await renderScreen(<SignupScreen />);
    await fillValid();
    await fireEvent.press(screen.getByTestId('auth.signup-submit'));

    expect(await screen.findByText('Esse e-mail já tem conta.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('auth.go-login-email-taken'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('falha de rede: preserva os campos, limpa as senhas e pede a senha de novo', async () => {
    mockSignUp.mockRejectedValue(new ApiError({ kind: 'network' }));
    await renderScreen(<SignupScreen />);
    await fillValid();
    await fireEvent.press(screen.getByTestId('auth.signup-submit'));

    expect(await screen.findByText('Não conseguimos criar a conta agora. O que você digitou está aqui.')).toBeOnTheScreen();
    expect(screen.getByTestId('auth.signup-name-input').props.value).toBe('Maria Souza');
    expect(screen.getByTestId('auth.password-input').props.value).toBe('');
    expect(screen.getByText('Digite a senha de novo.')).toBeOnTheScreen();
  });

  it('sem conexão: explica e não chama a API (botão continua ativo)', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<SignupScreen />);
    await fillValid();
    await fireEvent.press(screen.getByTestId('auth.signup-submit'));
    expect(await screen.findByText('Conecte-se para criar a conta. O que você digitou está aqui.')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });

  it('os links abrem Termos e Privacidade em tela própria', async () => {
    await renderScreen(<SignupScreen />);
    await fireEvent.press(screen.getByTestId('auth.terms-link'));
    expect(mockRouter.push).toHaveBeenCalledWith('/legal/customer_terms');
    await fireEvent.press(screen.getByTestId('auth.privacy-link'));
    expect(mockRouter.push).toHaveBeenCalledWith('/legal/privacy');
  });
});
