import type { MyCoupon } from '@webag/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import CouponsScreen from '../app/(customer)/coupons';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { benefitLabel, compensationNote, isExpiringSoon } from '../src/features/coupons/model';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock } };
const router = expoRouter.__router;
const Clipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };

const mockFetch = jest.fn();
jest.mock('../src/api/coupons-api', () => ({ fetchMyCoupons: (...a: unknown[]) => mockFetch(...a) }));
const mockPut = jest.fn();
jest.mock('../src/api/cart-api', () => ({ putCartCoupon: (...a: unknown[]) => mockPut(...a), putCartItem: jest.fn(), fetchCart: jest.fn() }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const coupon = (over: Partial<MyCoupon> = {}): MyCoupon => ({ id: 'c1', code: 'ATRASOK7M2QXW9', kind: 'free_shipping', valueCents: null, percent: null, minOrderCents: 0, startsAt: inHours(-1), expiresAt: inHours(24 * 20), status: 'available', origin: 'late_delivery', ...over });
const page = (data: MyCoupon[], nextCursor: string | null = null) => ({ data, nextCursor });

beforeEach(async () => {
  jest.clearAllMocks();
  await sessionStore.clear();
  await login();
});

describe('Meus cupons (WB-033, GET /v1/me/coupons)', () => {
  it('lista a compensação por atraso com o benefício em palavras, a validade e a origem', async () => {
    mockFetch.mockResolvedValue(page([coupon()]));
    await renderScreen(<CouponsScreen />);
    expect(await screen.findByText('Entrega grátis')).toBeOnTheScreen();
    expect(screen.getByText('ATRASOK7M2QXW9')).toBeOnTheScreen();
    expect(screen.getByText(/^Vale até \d+ \w{3}$/)).toBeOnTheScreen();
    expect(screen.getByText('Pedimos desculpas pelo atraso no seu pedido.')).toBeOnTheScreen();
    expect(screen.queryByTestId('coupons.item-c1-expiring')).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('available', null, expect.anything());
  });

  it('mostra "Vence em breve" quando faltam até 48 h e o valor fixo vem do servidor', async () => {
    mockFetch.mockResolvedValue(page([coupon({ kind: 'fixed', valueCents: 1000, minOrderCents: 4000, expiresAt: inHours(30) })]));
    await renderScreen(<CouponsScreen />);
    expect(await screen.findByText(/R\$\s10,00 de desconto/)).toBeOnTheScreen();
    expect(screen.getByText(/Pedidos a partir de R\$\s40,00/)).toBeOnTheScreen();
    expect(screen.getByTestId('coupons.item-c1-expiring')).toBeOnTheScreen();
  });

  it('"Usar" aplica o código na sacola e abre a sacola', async () => {
    mockFetch.mockResolvedValue(page([coupon()]));
    mockPut.mockResolvedValue({ summary: { discount: { amount: 500 } }, items: [], coupon: null });
    await renderScreen(<CouponsScreen />);
    await fireEvent.press(await screen.findByTestId('coupons.item-c1-use'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('ATRASOK7M2QXW9', expect.anything()));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/cart'));
  });

  it('"Usar" com a sacola recusada mostra o motivo e não abre a sacola', async () => {
    mockFetch.mockResolvedValue(page([coupon()]));
    mockPut.mockRejectedValue(new ApiError({ kind: 'problem', status: 409, code: 'COUPON_OTHER_STORE' }));
    await renderScreen(<CouponsScreen />);
    await fireEvent.press(await screen.findByTestId('coupons.item-c1-use'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalledWith('/cart');
  });

  it('copia o código', async () => {
    mockFetch.mockResolvedValue(page([coupon()]));
    await renderScreen(<CouponsScreen />);
    await fireEvent.press(await screen.findByTestId('coupons.item-c1-copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ATRASOK7M2QXW9');
  });

  it('"Todos" pede status=all; cupom usado ou vencido não tem "Usar"', async () => {
    mockFetch.mockResolvedValueOnce(page([])).mockResolvedValue(page([coupon({ id: 'c2', status: 'used' }), coupon({ id: 'c3', status: 'expired', expiresAt: inHours(-48) })]));
    await renderScreen(<CouponsScreen />);
    expect(await screen.findByTestId('coupons.empty')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('coupons.filter-all'));
    expect(await screen.findByText('Já usado')).toBeOnTheScreen();
    expect(screen.getByText(/^Venceu em/)).toBeOnTheScreen();
    expect(screen.queryByTestId('coupons.item-c2-use')).toBeNull();
    expect(screen.queryByTestId('coupons.item-c3-use')).toBeNull();
    expect(mockFetch).toHaveBeenLastCalledWith('all', null, expect.anything());
  });

  it('vazio, erro com tentar de novo e visitante', async () => {
    mockFetch.mockResolvedValueOnce(page([]));
    await renderScreen(<CouponsScreen />);
    expect(await screen.findByText('Sem cupons agora')).toBeOnTheScreen();
  });

  it('erro: mostra tentar de novo e recarrega', async () => {
    mockFetch.mockRejectedValueOnce(new ApiError({ kind: 'server', status: 500 })).mockResolvedValue(page([coupon()]));
    await renderScreen(<CouponsScreen />);
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' });
    await fireEvent.press(retry);
    expect(await screen.findByText('Entrega grátis')).toBeOnTheScreen();
  });

  it('visitante: pede para entrar e não chama a API', async () => {
    await sessionStore.clear();
    await renderScreen(<CouponsScreen />);
    expect(await screen.findByTestId('coupons.guest')).toBeOnTheScreen();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('Modelo de cupons', () => {
  it('benefício, vence em breve e bilhete do pedido sem "30 dias" nem "2 h" fixos', () => {
    expect(benefitLabel({ kind: 'percent', valueCents: null, percent: 15 })).toBe('15% de desconto');
    expect(isExpiringSoon({ status: 'available', expiresAt: inHours(47) }, Date.now())).toBe(true);
    expect(isExpiringSoon({ status: 'available', expiresAt: inHours(49) }, Date.now())).toBe(false);
    expect(isExpiringSoon({ status: 'used', expiresAt: inHours(10) }, Date.now())).toBe(false);
    const free = compensationNote({ kind: 'free_shipping', valueCents: null, code: 'X', validUntil: inHours(100), status: 'available' });
    expect(free.title).toBe('Entrega grátis no próximo pedido');
    expect(`${free.title} ${free.body}`).not.toMatch(/30 dias|\b2 ?h\b/);
    expect(compensationNote({ kind: 'fixed', valueCents: 1000, code: 'X', validUntil: inHours(100), status: 'available' }).title).toMatch(/R\$\s10,00 de desconto no próximo pedido/);
    expect(compensationNote({ kind: 'fixed', valueCents: 1000, code: 'X', validUntil: inHours(100), status: 'used' }).body).toBe('Você já usou este cupom.');
  });
});
