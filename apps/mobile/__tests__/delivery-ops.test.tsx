import { screen } from '@testing-library/react-native';
import { fromServer } from '../src/features/cart/model';
import { deriveCta } from '../src/features/cart/state';
import { formatDeliveryBack } from '../src/features/catalog/format';
import { StoreRow } from '../src/features/catalog/StoreRow';
import { deriveGate } from '../src/features/checkout/state';
import { toCheckoutFailure } from '../src/features/checkout/errors';
import { ApiError } from '../src/api/problem';
import { serverCart, storeCard } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const NOON = new Date(new Date().setHours(12, 0, 0, 0));

describe('Entregas fechadas ou pausadas (BUG-016, RN-18)', () => {
  it('"Entrega volta" é hora falada: às 9h, às 9h30, amanhã às 9h, dia da semana; sem hora é null', () => {
    expect(formatDeliveryBack(at(0, 17), NOON)).toBe('às 17h');
    expect(formatDeliveryBack(at(0, 17, 30), NOON)).toBe('às 17h30');
    expect(formatDeliveryBack(at(1, 9), NOON)).toBe('amanhã às 9h');
    expect(formatDeliveryBack(at(3, 9), NOON)).toMatch(/^(domingo|segunda|terça|quarta|quinta|sexta|sábado) às 9h$/);
    expect(formatDeliveryBack(null)).toBeNull();
    expect(formatDeliveryBack('lixo')).toBeNull();
  });

  it('cartão da loja: chip "Entrega volta às 9h" quando a logística tem hora de volta; "Fora da área" quando não', async () => {
    const when = at(1, 9);
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...storeCard().delivery, available: false, logisticsOpensAt: when } })} testID="row" />);
    expect(screen.getByTestId('store-card.delivery-back')).toHaveTextContent('Entrega volta amanhã às 9h');
    expect(screen.getByTestId('row').props.accessibilityLabel).toContain('Entrega volta amanhã às 9h');
  });

  it('cartão da loja fora da área (sem hora de volta) segue dizendo "Fora da área de entrega"', async () => {
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...storeCard().delivery, available: false } })} testID="row" />);
    expect(screen.getByText('Fora da área de entrega')).toBeOnTheScreen();
    expect(screen.queryByTestId('store-card.delivery-back')).toBeNull();
  });

  const closed = (opensAt: string | null) => {
    const v = fromServer(
      serverCart({
        delivery: { mode: 'delivery', addressId: 'a1', available: false, distanceM: 1200, feeFromCents: 500, estimated: false, logisticsClosed: true, logisticsOpensAt: opensAt },
        checkout: { canCheckout: false, blockers: ['LOGISTICS_CLOSED'], opensAt: null },
      }) as never,
    );
    if (!v) throw new Error('sacola vazia');
    return v;
  };

  it('sacola: nada pré-selecionado, botão "Escolha como receber" e o aviso com a hora de volta', () => {
    const cta = deriveCta(closed(at(1, 9)));
    expect(cta).toMatchObject({ kind: 'logistics-closed', label: 'Escolha como receber', inert: false });
    expect(cta.banner?.testID).toBe('cart.logistics-banner');
    expect(cta.banner?.text).toBe('Entregas voltam amanhã às 9h. Você pode retirar na loja.');
  });

  it('pausa da operação (sem hora): "Entregas pausadas agora"', () => {
    expect(deriveCta(closed(null)).banner?.text).toBe('Entregas pausadas agora. Retire na loja ou tente daqui a pouco.');
  });

  it('checkout em entrega volta à sacola com o mesmo aviso; em retirada segue normal', () => {
    const view = closed(at(0, 17));
    expect(deriveGate(view, 'delivery', { remote: true, precision: 'full' } as never)).toMatchObject({ kind: 'back', banner: { testID: 'checkout.logistics-banner', text: 'Entregas voltam às 17h. Você pode retirar na loja.' } });
    expect(deriveGate(view, 'pickup', null).kind).toBe('ready');
  });

  it('o servidor recusa o pedido com LOGISTICS_CLOSED: mensagem clara, nunca "2 h"', () => {
    const failure = toCheckoutFailure(new ApiError({ kind: 'problem', status: 422, code: 'LOGISTICS_CLOSED' }));
    expect(failure).toMatchObject({ kind: 'blocked', message: 'As entregas estão fechadas agora. Retire na loja ou tente mais tarde.' });
  });
});
