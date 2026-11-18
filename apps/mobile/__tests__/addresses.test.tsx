import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AddressesScreen from '../app/addresses';
import { addressStore } from '../src/features/address/store';
import { MAX_ADDRESSES, type Address } from '../src/features/address/types';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const base: Omit<Address, 'id'> = {
  nickname: null, precision: 'full', cep: '07900000', street: 'Rua das Palmeiras', number: '120', noNumber: false, complement: '',
  district: 'Jardim Fortaleza', city: 'Francisco Morato', state: 'SP', latitude: null, longitude: null,
};

beforeEach(async () => {
  jest.clearAllMocks();
  await addressStore.clearAll();
  await addressStore.hydrate();
});

describe('Meus endereços e seletor (D3)', () => {
  it('vazio: mostra o próximo passo', async () => {
    await renderScreen(<AddressesScreen />);
    expect(screen.getByText('Nenhum endereço salvo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar endereço' }));
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it('lista como grupo de rádio, marca o atual e troca na hora ao tocar', async () => {
    const a = await addressStore.add({ ...base, nickname: 'home' });
    const b = await addressStore.add({ ...base, street: 'Rua Nova', number: '5' });
    await renderScreen(<AddressesScreen />);

    expect(screen.getByTestId('addresses.sheet').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByTestId(`addresses.item-${b!.id}`)).toBeChecked();
    expect(screen.getByTestId(`addresses.item-${a!.id}`)).not.toBeChecked();

    await fireEvent.press(screen.getByTestId(`addresses.item-${a!.id}`));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.currentId).toBe(a!.id);
  });

  it('com 8 endereços o botão continua ativo e explica o limite', async () => {
    for (let i = 0; i < MAX_ADDRESSES; i++) await addressStore.add({ ...base, number: String(i + 1) });
    await renderScreen(<AddressesScreen />);
    await fireEvent.press(screen.getByTestId('addresses.add'));
    expect(await screen.findByText('Limite de 8 endereços. Apague um para adicionar.')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('excluir pede confirmação; se era o único, volta ao "Onde você quer receber?"', async () => {
    const a = await addressStore.add(base);
    await renderScreen(<AddressesScreen />);
    await fireEvent.press(screen.getByTestId(`addresses.item-${a!.id}-menu`));
    await fireEvent.press(await screen.findByTestId('addresses.delete'));
    expect(await screen.findByText('Excluir este endereço?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('addresses.delete-confirm'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/location'));
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses).toHaveLength(0);
  });

  it('excluir o atual entre vários pede para escolher outro', async () => {
    await addressStore.add(base);
    const b = await addressStore.add({ ...base, number: '9' });
    await renderScreen(<AddressesScreen />);
    await fireEvent.press(screen.getByTestId(`addresses.item-${b!.id}-menu`));
    await fireEvent.press(await screen.findByTestId('addresses.delete'));
    await fireEvent.press(await screen.findByTestId('addresses.delete-confirm'));
    expect(await screen.findByText('Escolha onde receber')).toBeOnTheScreen();
  });

  it('visitante vê a nota para criar conta', async () => {
    await addressStore.add(base);
    await renderScreen(<AddressesScreen />);
    expect(screen.getByText('Crie uma conta para salvar mais endereços.')).toBeOnTheScreen();
  });
});
