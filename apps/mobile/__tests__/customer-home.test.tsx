import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AccountScreen from '../app/(customer)/(tabs)/account';
import { sessionStore } from '../src/api/session';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

beforeEach(async () => {
  jest.clearAllMocks();
  await sessionStore.clear();
});

describe('Conta do cliente', () => {
  it('visitante vê os caminhos de acesso e leva a entrar e criar conta', async () => {
    await renderScreen(<AccountScreen />);
    expect(screen.getByRole('header', { name: 'Conta' })).toBeOnTheScreen();
    expect(screen.getByText('Você está navegando sem conta')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home.signup'));
    expect(mockRouter.push).toHaveBeenCalledWith('/signup');
    await fireEvent.press(screen.getByTestId('account.favorites'));
    expect(mockRouter.push).toHaveBeenCalledWith('/favorites');
  });

  it('logado com e-mail não confirmado vê o aviso para digitar o código', async () => {
    await sessionStore.setSession({
      accessToken: 'a',
      refreshToken: 'r'.repeat(40),
      accessExpiresAt: Date.now() + 900_000,
      user: { id: 'u1', name: 'Maria Souza', email: 'maria@gmail.com', emailVerified: false },
    });
    await renderScreen(<AccountScreen />);
    expect(screen.getByText('Olá, Maria')).toBeOnTheScreen();
    expect(screen.getByText('Confirme seu e-mail para fazer outros pedidos e usar cupons.')).toBeOnTheScreen();
    expect(screen.getByText('Código enviado para maria@gmail.com.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Digitar código' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/verify-email');
  });

  it('sair apaga a sessão e avisa', async () => {
    await sessionStore.setSession({
      accessToken: 'a',
      refreshToken: 'r'.repeat(40),
      accessExpiresAt: Date.now() + 900_000,
      user: { id: 'u1', name: 'Maria Souza', email: 'maria@gmail.com', emailVerified: true },
    });
    globalThis.fetch = jest.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await renderScreen(<AccountScreen />);
    await fireEvent.press(screen.getByTestId('home.sign-out'));
    expect(await screen.findByText('Você saiu da conta.')).toBeOnTheScreen();
    await waitFor(() => expect(sessionStore.getState().status).toBe('anonymous'));
  });
});
