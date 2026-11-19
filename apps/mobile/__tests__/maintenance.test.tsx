import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '../app/(customer)/checkout';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { cartActions } from '../src/features/cart/store';
import { modeStore } from '../src/features/catalog/queries';
import { toCheckoutFailure } from '../src/features/checkout/errors';
import { MaintenanceBanner } from '../src/features/maintenance/MaintenanceBanner';
import { expectedBackLabel, isMaintenanceOn, maintenanceText } from '../src/features/maintenance/model';
import { serverCart, seedAddress } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const mockFetchCart = jest.fn();
jest.mock('../src/api/cart-api', () => ({ fetchCart: (...a: unknown[]) => mockFetchCart(...a), acceptCartChanges: jest.fn(), putCartItem: jest.fn(), mergeGuestCart: jest.fn() }));
const mockPlace = jest.fn();
jest.mock('../src/api/orders-api', () => ({ placeOrder: (...a: unknown[]) => mockPlace(...a), startCardIntent: jest.fn(), fetchOrders: jest.fn() }));
const mockMaintenance = jest.fn();
jest.mock('../src/api/config-api', () => ({ fetchMaintenance: (...a: unknown[]) => mockMaintenance(...a) }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });
const at = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m).toISOString();

beforeEach(async () => {
  jest.clearAllMocks();
  mockFetchCart.mockReset();
  mockPlace.mockReset();
  mockMaintenance.mockReset();
  mockMaintenance.mockResolvedValue({ active: false, message: null, expectedBackAt: null });
  mockFetchCart.mockResolvedValue(serverCart());
  await sessionStore.clear();
  await seedAddress('full', true);
  await cartActions.clear();
  await modeStore.set('delivery');
});

describe('WB-121: modo manutenção no app', () => {
  it('503 MAINTENANCE vira falha própria (não "provedor fora"), com a mensagem e a previsão do servidor', () => {
    const error = new ApiError({ kind: 'server', status: 503, code: 'MAINTENANCE', detail: 'Atualizando o sistema.', body: { code: 'MAINTENANCE', expectedBackAt: '2026-11-19T20:00:00Z' } });
    expect(toCheckoutFailure(error)).toEqual({ kind: 'maintenance', message: 'Atualizando o sistema.', expectedBackAt: '2026-11-19T20:00:00Z' });
    expect(toCheckoutFailure(new ApiError({ kind: 'server', status: 503, code: 'MAINTENANCE' }))).toEqual({ kind: 'maintenance', message: null, expectedBackAt: null });
    expect(toCheckoutFailure(new ApiError({ kind: 'server', status: 502, code: 'BAD_GATEWAY' }))).toEqual({ kind: 'provider-down' });
  });

  it('texto do aviso: mensagem do servidor ou padrão, e a previsão só quando existe', () => {
    const now = new Date(2026, 10, 19, 10, 0);
    expect(maintenanceText('Voltamos às 14h.', null, now)).toBe('Voltamos às 14h.');
    expect(maintenanceText(null, null, now)).toContain('Estamos em manutenção');
    expect(maintenanceText('Atualizando.', at(19, 14, 30), now)).toBe('Atualizando. Previsão de volta: hoje às 14h30.');
    expect(expectedBackLabel(at(20, 9, 0), now)).toBe('amanhã às 9h');
    expect(expectedBackLabel(at(25, 9, 0), now)).toBe('25/11 às 9h');
    expect(expectedBackLabel('x', now)).toBeNull();
    expect(isMaintenanceOn(null)).toBe(false);
    expect(isMaintenanceOn({ active: false } as never)).toBe(false);
    expect(isMaintenanceOn({ active: true, message: null, expectedBackAt: null })).toBe(true);
  });

  it('aviso da sacola e do checkout só aparece com a manutenção ligada e diz que a sacola continua salva', async () => {
    await renderScreen(<MaintenanceBanner />);
    await waitFor(() => expect(mockMaintenance).toHaveBeenCalled());
    expect(screen.queryByTestId('maintenance.banner')).toBeNull();
  });

  it('manutenção ligada: o aviso aparece com a mensagem e a sacola salva', async () => {
    mockMaintenance.mockResolvedValue({ active: true, message: 'Atualizando o sistema.', expectedBackAt: null });
    await renderScreen(<MaintenanceBanner />);
    const banner = await screen.findByTestId('maintenance.banner');
    expect(banner).toHaveTextContent(/Voltamos já\. Atualizando o sistema\. Sua sacola continua salva\./);
  });

  it('checkout: o servidor responde 503 MAINTENANCE ao pagar; mostra o aviso, não cria pedido, mantém a sacola e o botão volta a funcionar', async () => {
    await login();
    mockPlace.mockRejectedValue(new ApiError({ kind: 'server', status: 503, code: 'MAINTENANCE', detail: 'Atualizando o sistema.', body: { code: 'MAINTENANCE' } }));
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-pix'));
    await fireEvent.press(await screen.findByTestId('checkout.submit'));
    const banner = await screen.findByTestId('checkout.maintenance-banner');
    expect(banner).toHaveTextContent(/Atualizando o sistema\./);
    expect(banner).toHaveTextContent(/Sua sacola continua salva/);
    expect(mockPlace).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('checkout.error-banner')).toBeNull();
    // a sacola do servidor não foi limpa nem relida como vazia: o resumo segue na tela e dá para tentar de novo
    expect(screen.getByTestId('checkout.summary')).toBeOnTheScreen();
    expect(screen.getByTestId('checkout.submit')).toBeEnabled();
  });
});
