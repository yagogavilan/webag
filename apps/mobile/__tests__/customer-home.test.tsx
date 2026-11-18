import { fireEvent, screen } from '@testing-library/react-native';
import CustomerHome from '../app/(customer)/index';
import { sessionStore } from '../src/api/session';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

beforeEach(async () => {
  jest.clearAllMocks();
  await sessionStore.clear();
});

describe('Início do cliente', () => {
  it('mostra a marca como título acessível e os caminhos de acesso ao visitante', async () => {
    await renderScreen(<CustomerHome />);
    expect(screen.getByRole('header', { name: 'webag' })).toBeOnTheScreen();
    expect(screen.getByText('Lojas da sua região')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home.signup'));
    expect(mockRouter.push).toHaveBeenCalledWith('/signup');
  });

  it('logado com e-mail não confirmado vê o aviso para digitar o código', async () => {
    await sessionStore.setSession({
      accessToken: 'a',
      refreshToken: 'r'.repeat(40),
      accessExpiresAt: Date.now() + 900_000,
      user: { id: 'u1', name: 'Maria Souza', email: 'maria@gmail.com', emailVerified: false },
    });
    await renderScreen(<CustomerHome />);
    expect(screen.getByText('Olá, Maria')).toBeOnTheScreen();
    expect(screen.getByText('Confirme seu e-mail para fazer outros pedidos e usar cupons.')).toBeOnTheScreen();
    expect(screen.getByText('Código enviado para maria@gmail.com.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Digitar código' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/verify-email');
  });
});
