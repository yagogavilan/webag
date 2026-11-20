import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AccountScreen from '../app/(customer)/(tabs)/account';
import ProfileScreen from '../app/profile';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock } };
const mockMe = jest.fn();
const mockSave = jest.fn();
jest.mock('../src/api/me-api', () => ({ fetchMe: (...a: unknown[]) => mockMe(...a), saveProfile: (...a: unknown[]) => mockSave(...a) }));

const me = (over: Record<string, unknown> = {}) => ({ id: 'u1', email: 'maria@x.com', emailVerified: true, name: 'Maria Souza', phone: '11987654321', roles: ['customer'], adminProfile: null, pendingTerms: [], ...over });
const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria Souza', email: 'maria@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  await sessionStore.clear();
  await login();
  mockMe.mockResolvedValue(me());
});

describe('CC2. Meus dados', () => {
  it('a Conta (logado) tem o item Meus dados', async () => {
    await renderScreen(<AccountScreen />);
    await fireEvent.press(screen.getByTestId('account.item-data'));
    expect(expoRouter.__router.push).toHaveBeenCalledWith('/profile');
  });

  it('mostra nome e celular preenchidos, e-mail só leitura com o selo de confirmado', async () => {
    await renderScreen(<ProfileScreen />);
    expect(await screen.findByDisplayValue('Maria Souza')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('(11) 98765-4321')).toBeOnTheScreen();
    expect(screen.getByTestId('profile.email').props.accessibilityLabel).toBe('E-mail, não editável aqui: maria@x.com. E-mail confirmado');
    expect(screen.getByText('maria@x.com')).toBeOnTheScreen();
  });

  it('salvar sem mudança: "Nada mudou." e nenhuma chamada', async () => {
    await renderScreen(<ProfileScreen />);
    await screen.findByDisplayValue('Maria Souza');
    await fireEvent.press(screen.getByTestId('profile.save'));
    expect(await screen.findByText('Nada mudou.')).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('manda só o que mudou, atualiza o nome da sessão e confirma', async () => {
    mockSave.mockResolvedValue(me({ name: 'Maria S. Lima' }));
    await renderScreen(<ProfileScreen />);
    await fireEvent.changeText(await screen.findByTestId('profile.name-input'), 'Maria S. Lima');
    await fireEvent.press(screen.getByTestId('profile.save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ name: 'Maria S. Lima' }));
    expect(await screen.findByText('Dados salvos.')).toBeOnTheScreen();
    expect(sessionStore.getState()).toMatchObject({ status: 'authenticated', user: { name: 'Maria S. Lima' } });
  });

  it('celular: com máscara, e só envia se mudou', async () => {
    mockSave.mockResolvedValue(me({ phone: '11912345678' }));
    await renderScreen(<ProfileScreen />);
    await fireEvent.changeText(await screen.findByTestId('profile.phone-input'), '11912345678');
    await fireEvent.press(screen.getByTestId('profile.save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ phone: '(11) 91234-5678' }));
  });

  it('dado inválido não é salvo', async () => {
    await renderScreen(<ProfileScreen />);
    await fireEvent.changeText(await screen.findByTestId('profile.name-input'), 'M');
    await fireEvent.changeText(screen.getByTestId('profile.phone-input'), '1234');
    await fireEvent.press(screen.getByTestId('profile.save'));
    expect(await screen.findByText('Digite seu nome.')).toBeOnTheScreen();
    expect(screen.getByText('Confira o celular com DDD.')).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('falha ao salvar: aviso mantendo o que foi digitado', async () => {
    mockSave.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<ProfileScreen />);
    await fireEvent.changeText(await screen.findByTestId('profile.name-input'), 'Maria Nova');
    await fireEvent.press(screen.getByTestId('profile.save'));
    expect(await screen.findByText('Não foi possível salvar. O que você digitou está aqui.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Maria Nova')).toBeOnTheScreen();
  });

  it('erro ao carregar: tentar de novo', async () => {
    mockMe.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<ProfileScreen />);
    expect(await screen.findByText('Tentar de novo', {}, { timeout: 4000 })).toBeOnTheScreen();
  });
});
