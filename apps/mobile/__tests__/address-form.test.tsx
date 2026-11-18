import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AddressFormScreen from '../app/address/form';
import { addressStore } from '../src/features/address/store';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

const mockLookup = jest.fn();
jest.mock('../src/features/address/cep', () => ({ lookupCep: (...a: unknown[]) => mockLookup(...a) }));
const mockRegions = jest.fn();
jest.mock('../src/api/auth-api', () => ({ fetchRegions: () => mockRegions() }));
jest.mock('../src/features/address/location', () => ({ geocodeAddress: jest.fn(async () => ({ latitude: -23.28, longitude: -46.74 })) }));

const mockCreate = jest.fn();
jest.mock('../src/api/addresses-api', () => ({
  createRemoteAddress: (...a: unknown[]) => mockCreate(...a),
  updateRemoteAddress: jest.fn(),
}));

const city = { id: 'c1', name: 'Francisco Morato', state: 'SP', slug: 'fm', neighborhoods: [] };
const found = { kind: 'found', value: { street: 'Rua das Palmeiras', district: 'Jardim Fortaleza', city: 'Francisco Morato', state: 'SP' } };

beforeEach(async () => {
  jest.clearAllMocks();
  mockRegions.mockResolvedValue({ data: [city], nextCursor: null });
  await addressStore.clearAll();
  await addressStore.hydrate();
});

describe('Endereço por CEP (D2)', () => {
  it('ao completar 8 dígitos mostra skeleton, preenche rua, bairro e cidade e leva o foco ao Número', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockLookup.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<AddressFormScreen />);

    await fireEvent.changeText(screen.getByTestId('address.cep-input'), '07900000');
    expect(screen.getByTestId('address.cep-input').props.value).toBe('07900-000');
    expect(await screen.findByTestId('address.cep-skeleton')).toBeOnTheScreen();
    expect(screen.getByText('Buscando CEP…')).toBeOnTheScreen();

    release(found);
    await waitFor(() => expect(screen.getByTestId('address.street-input').props.value).toBe('Rua das Palmeiras'));
    expect(screen.getByTestId('address.district-input').props.value).toBe('Jardim Fortaleza');
    expect(screen.getByTestId('address.city-input').props.value).toBe('Francisco Morato');
    expect(screen.queryByTestId('address.cep-skeleton')).toBeNull();
  });

  it('CEP não encontrado: mensagem do design e campos editáveis', async () => {
    mockLookup.mockResolvedValue({ kind: 'not-found' });
    await renderScreen(<AddressFormScreen />);
    await fireEvent.changeText(screen.getByTestId('address.cep-input'), '99999999');
    expect(await screen.findByText('Não achamos esse CEP. Preencha rua e bairro.')).toBeOnTheScreen();
    expect(screen.getByTestId('address.street-input').props.editable).not.toBe(false);
  });

  it('botão ativo: vazio mostra os erros ao tocar e nada é salvo', async () => {
    await renderScreen(<AddressFormScreen />);
    await fireEvent.press(screen.getByTestId('address.submit'));
    expect(await screen.findByText('Digite o CEP com 8 números.')).toBeOnTheScreen();
    expect(screen.getByText('Digite a rua.')).toBeOnTheScreen();
    expect(screen.getByText('Digite o número ou marque Sem número.')).toBeOnTheScreen();
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses).toHaveLength(0);
  });

  it('salva (visitante), vira o endereço atual e volta ao início', async () => {
    mockLookup.mockResolvedValue(found);
    await renderScreen(<AddressFormScreen />);
    await fireEvent.changeText(screen.getByTestId('address.cep-input'), '07900000');
    await waitFor(() => expect(screen.getByTestId('address.street-input').props.value).toBe('Rua das Palmeiras'));
    await fireEvent.changeText(screen.getByTestId('address.number-input'), '120');
    await fireEvent.press(screen.getByTestId('address.submit'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses[0]).toMatchObject({ street: 'Rua das Palmeiras', number: '120', cep: '07900000', latitude: -23.28, precision: 'full' });
    expect(await screen.findByText('Entregando em Rua das Palmeiras, 120.')).toBeOnTheScreen();
  });

  it('"Sem número" dispensa o número', async () => {
    mockLookup.mockResolvedValue(found);
    await renderScreen(<AddressFormScreen />);
    await fireEvent.changeText(screen.getByTestId('address.cep-input'), '07900000');
    await waitFor(() => expect(screen.getByTestId('address.street-input').props.value).toBe('Rua das Palmeiras'));
    await fireEvent.press(screen.getByTestId('address.no-number'));
    await fireEvent.press(screen.getByTestId('address.submit'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('cidade fora das regiões ativas não salva e abre "Ainda não entregamos"', async () => {
    mockLookup.mockResolvedValue({ kind: 'found', value: { street: 'Rua X', district: 'Centro', city: 'Campinas', state: 'SP' } });
    await renderScreen(<AddressFormScreen />);
    await fireEvent.changeText(screen.getByTestId('address.cep-input'), '13010000');
    await waitFor(() => expect(screen.getByTestId('address.street-input').props.value).toBe('Rua X'));
    await fireEvent.changeText(screen.getByTestId('address.number-input'), '10');
    await fireEvent.press(screen.getByTestId('address.submit'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/region-unavailable', params: { place: 'Centro', city: 'Campinas' } }));
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses).toHaveLength(0);
  });

  it('sem conexão: avisa para preencher à mão e, ao salvar, explica sem perder o digitado', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<AddressFormScreen />);
    await fireEvent.changeText(screen.getByTestId('address.cep-input'), '07900000');
    expect(await screen.findByText('Sem conexão. Preencha rua e bairro à mão.')).toBeOnTheScreen();
    expect(mockLookup).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('address.street-input'), 'Rua A');
    await fireEvent.changeText(screen.getByTestId('address.district-input'), 'Centro');
    await fireEvent.changeText(screen.getByTestId('address.city-input'), 'Francisco Morato');
    await fireEvent.changeText(screen.getByTestId('address.number-input'), '1');
    await fireEvent.press(screen.getByTestId('address.submit'));
    expect(await screen.findByText('Conecte-se para salvar o endereço. O que você digitou está aqui.')).toBeOnTheScreen();
    expect(screen.getByTestId('address.street-input').props.value).toBe('Rua A');
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });

  describe('logado: salva na API', () => {
    const fill = async () => {
      mockLookup.mockResolvedValue(found);
      await sessionStore.setSession({
        accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000,
        user: { id: 'u1', name: 'Maria Souza', email: 'maria@gmail.com', emailVerified: true },
      });
      await renderScreen(<AddressFormScreen />);
      await fireEvent.changeText(screen.getByTestId('address.cep-input'), '07900000');
      await waitFor(() => expect(screen.getByTestId('address.street-input').props.value).toBe('Rua das Palmeiras'));
      await fireEvent.changeText(screen.getByTestId('address.number-input'), '120');
      await fireEvent.press(screen.getByTestId('address.submit'));
    };

    afterEach(async () => {
      await sessionStore.clear();
    });

    it('envia à API e guarda no cache com o id do servidor', async () => {
      mockCreate.mockResolvedValue({
        id: 'srv-1', nickname: null, precision: 'full', cep: '07900000', street: 'Rua das Palmeiras', number: '120', noNumber: false,
        complement: '', district: 'Jardim Fortaleza', city: 'Francisco Morato', state: 'SP', latitude: -23.28, longitude: -46.74, remote: true,
      });
      await fill();
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ cep: '07900000', number: '120', district: 'Jardim Fortaleza' }));
      const state = addressStore.getState();
      expect(state.status === 'ready' && state.addresses[0]).toMatchObject({ id: 'srv-1', remote: true });
      expect(await screen.findByText('Endereço salvo.')).toBeOnTheScreen();
    });

    it('limite da conta (422 ADDRESS_LIMIT_REACHED) explica e não salva', async () => {
      mockCreate.mockRejectedValue(new ApiError({ kind: 'problem', status: 422, code: 'ADDRESS_LIMIT_REACHED' }));
      await fill();
      expect(await screen.findByText('Limite de 8 endereços. Apague um para adicionar.')).toBeOnTheScreen();
      const state = addressStore.getState();
      expect(state.status === 'ready' && state.addresses).toHaveLength(0);
    });

    it('região não atendida (422 REGION_NOT_SERVED) abre "Ainda não entregamos"', async () => {
      mockCreate.mockRejectedValue(new ApiError({ kind: 'problem', status: 422, code: 'REGION_NOT_SERVED' }));
      await fill();
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/region-unavailable', params: { place: 'Jardim Fortaleza', city: 'Francisco Morato' } }));
    });
  });
});
