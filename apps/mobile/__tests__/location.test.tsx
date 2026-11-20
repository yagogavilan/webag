import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import LocationScreen from '../app/location';
import { addressStore } from '../src/features/address/store';
import { renderScreen } from '../src/test/render';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
const mockRegions = jest.fn();
jest.mock('../src/api/auth-api', () => ({ fetchRegions: () => mockRegions() }));
const mockLocate = jest.fn();
const mockGeocode = jest.fn();
jest.mock('../src/features/address/location', () => ({
  locateApproximately: () => mockLocate(),
  geocodeAddress: (...a: unknown[]) => mockGeocode(...a),
}));

const city = { id: 'c1', name: 'Francisco Morato', state: 'SP', slug: 'fm', neighborhoods: [] };
const place = { latitude: -23.28, longitude: -46.74, city: 'Francisco Morato', district: 'Jardim Fortaleza', state: 'SP' };

beforeEach(async () => {
  jest.clearAllMocks();
  mockRegions.mockResolvedValue({ data: [city], nextCursor: null });
  mockGeocode.mockResolvedValue(null);
  await addressStore.clearAll();
  await addressStore.hydrate();
});

describe('Onde você quer receber? (D1)', () => {
  it('explica o motivo antes do pedido do sistema e oferece os 3 caminhos', async () => {
    await renderScreen(<LocationScreen />);
    expect(screen.getByRole('header', { name: 'Onde você quer receber?' })).toBeOnTheScreen();
    expect(screen.getByText('Mostramos só as lojas que entregam aí.')).toBeOnTheScreen();
    expect(screen.getByTestId('location.use-gps')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('location.enter-cep'));
    expect(mockRouter.push).toHaveBeenCalledWith('/address/form');
    expect(screen.getByTestId('location.choose-city')).toBeOnTheScreen();
  });

  it('GPS em região ativa guarda o endereço aproximado e abre o início com o aviso', async () => {
    mockLocate.mockResolvedValue({ kind: 'ok', place });
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.use-gps'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(await screen.findByText('Entregando em Jardim Fortaleza.')).toBeOnTheScreen();
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses[0]).toMatchObject({ precision: 'approx', district: 'Jardim Fortaleza', city: 'Francisco Morato' });
  });

  it('GPS fora de região ativa abre "Ainda não entregamos" sem guardar', async () => {
    mockLocate.mockResolvedValue({ kind: 'ok', place: { ...place, city: 'Campinas', district: 'Centro' } });
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.use-gps'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/region-unavailable', params: { place: 'Centro', city: 'Campinas' } }));
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses).toHaveLength(0);
  });

  it('permissão negada: título muda, CEP vira o caminho principal e há link para Ajustes', async () => {
    mockLocate.mockResolvedValue({ kind: 'blocked' });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.use-gps'));

    expect(await screen.findByText('Sem a localização, digite o CEP.')).toBeOnTheScreen();
    expect(screen.queryByTestId('location.use-gps')).toBeNull();
    await fireEvent.press(screen.getByTestId('location.open-settings'));
    expect(openSettings).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('location.enter-cep'));
    expect(mockRouter.push).toHaveBeenCalledWith('/address/form');
  });

  it('GPS sem resposta: pede o CEP', async () => {
    mockLocate.mockResolvedValue({ kind: 'failed' });
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.use-gps'));
    expect(await screen.findByText('Não conseguimos achar você. Digite o CEP.')).toBeOnTheScreen();
  });

  it('sem conexão: estado offline com tentar de novo e o CEP continua disponível', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.use-gps'));
    expect(await screen.findByText('Conecte-se para ver as lojas perto de você.')).toBeOnTheScreen();
    expect(mockLocate).not.toHaveBeenCalled();
    expect(screen.getByTestId('location.enter-cep')).toBeOnTheScreen();
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });

  it('escolher a cidade lista as cidades ativas e abre o início com endereço aproximado', async () => {
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.choose-city'));
    await fireEvent.press(await screen.findByTestId('location.city-c1'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    const state = addressStore.getState();
    // sem ponto do geocodificador do aparelho, usa o centro da cidade: sem coordenada a busca por raio não funciona
    expect(state.status === 'ready' && state.addresses[0]).toMatchObject({ precision: 'approx', city: 'Francisco Morato', district: '', latitude: -23.2794 });
  });

  it('cidade com bairros cadastrados abre a escolha do bairro; o bairro vai no endereço aproximado', async () => {
    mockRegions.mockResolvedValue({
      data: [{ ...city, neighborhoods: [{ id: 'n1', name: 'Jardim Fortaleza' }] }],
      nextCursor: null,
    });
    mockGeocode.mockResolvedValue({ latitude: -23.27, longitude: -46.75 });
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.choose-city'));
    await fireEvent.press(await screen.findByTestId('location.city-c1'));
    expect(screen.getByText('Qualquer bairro de Francisco Morato')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('location.neighborhood-n1'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses[0]).toMatchObject({ district: 'Jardim Fortaleza', latitude: -23.27, longitude: -46.75 });
  });

  it('lista de cidades com erro mostra tentar de novo', async () => {
    mockRegions.mockRejectedValue(new Error('x'));
    await renderScreen(<LocationScreen />);
    await fireEvent.press(screen.getByTestId('location.choose-city'));
    expect(await screen.findByText('Não conseguimos carregar agora.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });
});
