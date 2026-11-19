import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import CartScreen from '../app/(customer)/cart';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { cartActions } from '../src/features/cart/store';
import { modeStore } from '../src/features/catalog/queries';
import { serverCart, serverCartItem, seedAddress } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock } };
const router = expoRouter.__router;

const mockFetch = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockCoupon = jest.fn();
const mockRemoveCoupon = jest.fn();
const mockAck = jest.fn();
jest.mock('../src/api/cart-api', () => ({
  fetchCart: (...a: unknown[]) => mockFetch(...a),
  putCartItem: (...a: unknown[]) => mockPut(...a),
  deleteCartItem: (...a: unknown[]) => mockDelete(...a),
  emptyCart: jest.fn(),
  putCartCoupon: (...a: unknown[]) => mockCoupon(...a),
  deleteCartCoupon: (...a: unknown[]) => mockRemoveCoupon(...a),
  acceptCartChanges: (...a: unknown[]) => mockAck(...a),
  mergeGuestCart: jest.fn(),
}));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });
const money = (amount: number) => ({ amount, currency: 'BRL' });
const withBlockers = (blockers: string[], over: Record<string, unknown> = {}) => serverCart({ checkout: { canCheckout: false, blockers, opensAt: null }, ...over });
const setNetwork = (online: boolean) => (jest.requireMock('expo-network') as { useNetworkState: jest.Mock }).useNetworkState.mockReturnValue({ isConnected: online, isInternetReachable: online });

beforeEach(async () => {
  jest.clearAllMocks();
  [mockFetch, mockPut, mockDelete, mockCoupon, mockRemoveCoupon, mockAck].forEach((m) => m.mockReset());
  setNetwork(true);
  await sessionStore.clear();
  await seedAddress('full');
  await cartActions.clear();
  await modeStore.set('delivery');
});

describe('Sacola de visitante (S1)', () => {
  const addLocal = (quantity = 2) => cartActions.add('s1', 'Casa Bela', { productId: 'p1', variantId: 'v40', name: 'Tênis Corrida Veloz', variantLabel: 'Tamanho 40', urls: {}, unitPriceCents: 8990, originalPriceCents: null, quantity, maxQuantity: 5 });

  it('vazia: explica e leva às lojas', async () => {
    await renderScreen(<CartScreen />);
    expect(screen.getByText('Sua sacola está vazia')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver lojas' }));
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('mostra só o subtotal que o visitante viu e leva a criar conta ao pagar, voltando direto ao checkout (U8.2)', async () => {
    await addLocal();
    await renderScreen(<CartScreen />);
    expect(screen.getByText('Tênis Corrida Veloz')).toBeOnTheScreen();
    expect(screen.getByTestId('cart.visitor-summary')).toBeOnTheScreen();
    expect(screen.getByTestId('cart.total')).toHaveTextContent('R$ 179,80');
    await fireEvent.press(screen.getByTestId('cart.submit'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/signup', params: { returnTo: '/checkout', context: 'checkout' } });
  });

  it('muda a quantidade no aparelho (sem rede) e remove com "Desfazer"', async () => {
    setNetwork(false);
    await addLocal(1);
    await renderScreen(<CartScreen />);
    await fireEvent.press(screen.getByLabelText('Aumentar quantidade'));
    await waitFor(() => expect(screen.getByTestId('cart.total')).toHaveTextContent('R$ 179,80'));
    await fireEvent.press(screen.getByLabelText('Diminuir quantidade'));
    await waitFor(() => expect(screen.getByTestId('cart.total')).toHaveTextContent('R$ 89,90'));
    await fireEvent.press(screen.getByLabelText('Remover Tênis Corrida Veloz'));
    expect(await screen.findByText('Sua sacola está vazia')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByText('Tênis Corrida Veloz')).toBeOnTheScreen();
  });

  it('cupom pede conta: o toque leva a entrar', async () => {
    await addLocal();
    await renderScreen(<CartScreen />);
    await fireEvent.press(screen.getByTestId('cart.coupon-toggle'));
    expect(router.push).toHaveBeenCalled();
  });
});

describe('Sacola da conta (S1)', () => {
  beforeEach(async () => {
    await login();
  });

  it('skeleton enquanto confere e depois mostra o resumo exatamente como o servidor mandou', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockFetch.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<CartScreen />);
    expect(await screen.findByTestId('cart.skeleton')).toBeOnTheScreen();
    await act(async () => release(serverCart()));
    expect(await screen.findByTestId('cart.item-v40')).toBeOnTheScreen();
    expect(screen.getByTestId('cart.subtotal').props.accessibilityLabel).toBe('Subtotal, R$ 179,80');
    expect(screen.getByTestId('cart.delivery').props.accessibilityLabel).toBe('Entrega, R$ 5,00');
    expect(screen.getByText('Taxa de serviço')).toBeOnTheScreen();
    expect(screen.getByTestId('cart.total')).toHaveTextContent('R$ 186,80');
    expect(screen.getByText(/Chega entre \d{2}:\d{2} e \d{2}:\d{2}/)).toBeOnTheScreen();
  });

  it('entrega grátis aparece como "Grátis"', async () => {
    mockFetch.mockResolvedValue(serverCart({ summary: { ...serverCart().summary, delivery: money(0), freeShipping: true } }));
    await renderScreen(<CartScreen />);
    expect((await screen.findByTestId('cart.delivery')).props.accessibilityLabel).toBe('Entrega, Grátis');
  });

  it('endereço aproximado: o frete é "a partir de"', async () => {
    mockFetch.mockResolvedValue(serverCart({ summary: { ...serverCart().summary, deliveryEstimated: true } }));
    await renderScreen(<CartScreen />);
    expect((await screen.findByTestId('cart.delivery')).props.accessibilityLabel).toBe('Entrega, a partir de R$ 5,00');
  });

  it('erro sem sacola em tela: tentar de novo', async () => {
    mockFetch.mockRejectedValueOnce(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<CartScreen />);
    expect(await screen.findByTestId('cart.error')).toBeOnTheScreen();
    mockFetch.mockResolvedValue(serverCart());
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByTestId('cart.item-v40')).toBeOnTheScreen();
  });

  it('aumentar manda a quantidade ABSOLUTA e o total passa a ser o da resposta', async () => {
    mockFetch.mockResolvedValue(serverCart());
    mockPut.mockResolvedValue(serverCart({ items: [serverCartItem({ quantity: 3, lineTotal: money(26970) })], summary: { ...serverCart().summary, subtotal: money(26970), total: money(27670) } }));
    await renderScreen(<CartScreen />);
    await fireEvent.press(await screen.findByLabelText('Aumentar quantidade'));
    expect(screen.getByTestId('cart.item-v40-qty').props.accessibilityValue.now).toBe(3);
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('v40', 3, expect.objectContaining({ mode: 'delivery' })));
    await waitFor(() => expect(screen.getByTestId('cart.total')).toHaveTextContent('R$ 276,70'));
  });

  it('falha ao mudar a quantidade: volta ao valor do servidor e avisa', async () => {
    mockFetch.mockResolvedValue(serverCart());
    mockPut.mockRejectedValue(new ApiError({ kind: 'network' }));
    await renderScreen(<CartScreen />);
    await fireEvent.press(await screen.findByLabelText('Aumentar quantidade'));
    expect(await screen.findByText('Conecte-se para alterar a sacola.')).toBeOnTheScreen();
    expect(screen.getByTestId('cart.item-v40-qty').props.accessibilityValue.now).toBe(2);
  });

  it('remover (lixeira em quantidade 1) chama a API e "Desfazer" põe a mesma quantidade de volta', async () => {
    const one = serverCart({ items: [serverCartItem({ quantity: 1, lineTotal: money(8990) })] });
    mockFetch.mockResolvedValue(one);
    mockDelete.mockResolvedValue(serverCart({ items: [], store: null }));
    mockPut.mockResolvedValue(one);
    await renderScreen(<CartScreen />);
    await fireEvent.press(await screen.findByLabelText('Remover Tênis Corrida Veloz'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('v40', expect.anything()));
    expect(await screen.findByText('Sua sacola está vazia')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(mockPut).toHaveBeenLastCalledWith('v40', 1, expect.anything()));
  });

  it('aviso de preço e de estoque por item, com "Aceitar e continuar" que só então libera o pagamento', async () => {
    const warned = serverCart({
      items: [
        serverCartItem({ warnings: [{ code: 'PRICE_CHANGED', message: 'x', fromCents: 8990, toCents: 9490 }] }),
        serverCartItem({ id: 'ci2', variantId: 'v42', quantity: 1, warnings: [{ code: 'QUANTITY_EXCEEDS_STOCK', message: 'x', requestedQuantity: 4, maxQuantity: 1 }] }),
      ],
    });
    mockFetch.mockResolvedValue(warned);
    mockAck.mockResolvedValue(serverCart());
    await renderScreen(<CartScreen />);
    expect(await screen.findByText('O preço mudou de R$ 89,90 para R$ 94,90.')).toBeOnTheScreen();
    expect(screen.getByText('Só temos 1 unidade. Ajustamos a quantidade.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cart.submit'));
    // banner + toast: o pagamento não segue enquanto o cliente não aceitar as mudanças
    await waitFor(() => expect(screen.getAllByText('Algo mudou na sua sacola. Confira os avisos.')).toHaveLength(2));
    await fireEvent.press(screen.getByRole('button', { name: 'Aceitar e continuar' }));
    await waitFor(() => expect(mockAck).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('cart.changes')).toBeNull());
  });

  it('item esgotado: sem stepper, com "Remover", e o botão ativo explica ao tocar', async () => {
    mockFetch.mockResolvedValue(
      withBlockers(['ITEM_UNAVAILABLE'], { items: [serverCartItem({ available: false, quantity: 0, lineTotal: money(0), warnings: [{ code: 'OUT_OF_STOCK', message: 'x' }] })] }),
    );
    await renderScreen(<CartScreen />);
    expect(await screen.findByText('Esse item esgotou. Remova para continuar.')).toBeOnTheScreen();
    expect(screen.queryByTestId('cart.item-v40-qty')).toBeNull();
    expect(screen.getByTestId('cart.item-v40-remove')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cart.submit'));
    expect(await screen.findByText('Remova o item esgotado para continuar.')).toBeOnTheScreen();
  });

  it('loja fechada: botão inerte com o motivo no rótulo e aviso de que a sacola fica guardada', async () => {
    const opens = new Date(Date.now() + 36 * 3600_000).toISOString();
    mockFetch.mockResolvedValue(withBlockers(['STORE_CLOSED'], { store: { ...serverCart().store, open: false, opensAt: opens } }));
    await renderScreen(<CartScreen />);
    expect(await screen.findByTestId('cart.closed-banner')).toBeOnTheScreen();
    const submit = screen.getByTestId('cart.submit');
    expect(submit).toBeDisabled();
    expect(screen.getByText(/^Loja fechada/)).toBeOnTheScreen();
  });

  it('abaixo do mínimo: aviso com quanto falta e o botão vira "Adicionar mais itens"', async () => {
    mockFetch.mockResolvedValue(withBlockers(['BELOW_MINIMUM'], { summary: { ...serverCart().summary, missingForMinimum: money(1200) } }));
    await renderScreen(<CartScreen />);
    expect(await screen.findByText('Faltam R$ 12,00 para o pedido mínimo da loja.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cart.submit'));
    expect(router.push).toHaveBeenCalledWith('/store/s1');
  });

  it('fora do raio: oferece trocar o endereço', async () => {
    mockFetch.mockResolvedValue(withBlockers(['OUT_OF_RANGE']));
    await renderScreen(<CartScreen />);
    expect(await screen.findByText('A loja não entrega no seu endereço.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cart.submit'));
    expect(router.push).toHaveBeenCalledWith('/addresses');
  });

  it('sacola pagável: "Ir para o pagamento" abre o checkout (U8.1)', async () => {
    mockFetch.mockResolvedValue(serverCart());
    await renderScreen(<CartScreen />);
    await screen.findByTestId('cart.item-v40');
    await fireEvent.press(screen.getByTestId('cart.submit'));
    expect(router.push).toHaveBeenCalledWith('/checkout');
  });

  it('com mudança pendente o checkout continua barrado (U8.1)', async () => {
    mockFetch.mockResolvedValue(serverCart({ items: [serverCartItem({ warnings: [{ code: 'PRICE_CHANGED', message: 'x', fromCents: 8990, toCents: 9490 }] })] }));
    await renderScreen(<CartScreen />);
    await screen.findByText('O preço mudou de R$ 89,90 para R$ 94,90.');
    await fireEvent.press(screen.getByTestId('cart.submit'));
    expect(router.push).not.toHaveBeenCalledWith('/checkout');
  });

  it('sem internet: pagar não segue e diz que a sacola está salva', async () => {
    mockFetch.mockResolvedValue(serverCart());
    setNetwork(false);
    await renderScreen(<CartScreen />);
    await screen.findByTestId('cart.item-v40');
    await fireEvent.press(screen.getByTestId('cart.submit'));
    expect(await screen.findByText('Conecte-se para pagar. Sua sacola está salva.')).toBeOnTheScreen();
  });

  describe('cupom', () => {
    it('aplica, mostra o chip com o valor e permite remover', async () => {
      mockFetch.mockResolvedValue(serverCart());
      const applied = serverCart({ coupon: { code: 'BEMVINDO10', kind: 'fixed', scope: 'store', applied: true, rejection: null }, summary: { ...serverCart().summary, discount: money(1000), total: money(17680) } });
      mockCoupon.mockResolvedValue(applied);
      mockRemoveCoupon.mockResolvedValue(serverCart());
      await renderScreen(<CartScreen />);
      await fireEvent.press(await screen.findByTestId('cart.coupon-toggle'));
      await fireEvent.changeText(screen.getByTestId('cart.coupon-input'), 'bemvindo10');
      await fireEvent.press(screen.getByTestId('cart.coupon-apply'));
      await waitFor(() => expect(mockCoupon).toHaveBeenCalledWith('bemvindo10', expect.anything()));
      expect(await screen.findByText('Cupom aplicado. Você economiza R$ 10,00.')).toBeOnTheScreen();
      expect(screen.getByTestId('cart.coupon-chip')).toBeOnTheScreen();
      expect(screen.getByTestId('cart.total')).toHaveTextContent('R$ 176,80');
      await fireEvent.press(screen.getByTestId('cart.coupon-remove'));
      await waitFor(() => expect(screen.queryByTestId('cart.coupon-chip')).toBeNull());
    });

    it('recusado: mostra o motivo do servidor no campo, sem mudar a sacola', async () => {
      mockFetch.mockResolvedValue(serverCart());
      mockCoupon.mockRejectedValue(new ApiError({ kind: 'problem', status: 422, code: 'COUPON_MIN_ORDER', detail: 'Esse cupom vale a partir de R$ 80,00.' }));
      await renderScreen(<CartScreen />);
      await fireEvent.press(await screen.findByTestId('cart.coupon-toggle'));
      await fireEvent.changeText(screen.getByTestId('cart.coupon-input'), 'GRANDE');
      await fireEvent.press(screen.getByTestId('cart.coupon-apply'));
      expect(await screen.findByText('Esse cupom vale a partir de R$ 80,00.')).toBeOnTheScreen();
      expect(screen.getByTestId('cart.total')).toHaveTextContent('R$ 186,80');
    });

    it('sem internet: avisa antes de chamar a API', async () => {
      mockFetch.mockResolvedValue(serverCart());
      setNetwork(false);
      await renderScreen(<CartScreen />);
      await fireEvent.press(await screen.findByTestId('cart.coupon-toggle'));
      await fireEvent.changeText(screen.getByTestId('cart.coupon-input'), 'X1');
      await fireEvent.press(screen.getByTestId('cart.coupon-apply'));
      expect(await screen.findByText('Conecte-se para aplicar o cupom.')).toBeOnTheScreen();
      expect(mockCoupon).not.toHaveBeenCalled();
    });

    it('cupom que deixou de valer: o código fica e o motivo aparece', async () => {
      mockFetch.mockResolvedValue(serverCart({ coupon: { code: 'VELHO', kind: 'fixed', scope: 'store', applied: false, rejection: 'Esse cupom venceu em 10 nov.' } }));
      await renderScreen(<CartScreen />);
      expect(await screen.findByText('Esse cupom venceu em 10 nov.')).toBeOnTheScreen();
    });
  });
});
