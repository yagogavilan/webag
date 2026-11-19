import { screen } from '@testing-library/react-native';
import { fromServer } from '../src/features/cart/model';
import { deriveCta } from '../src/features/cart/state';
import { formatDeliveryBack } from '../src/features/catalog/format';
import { deliveryUnavailable } from '../src/features/catalog/unavailable';
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

  it('cartão da loja: chip "Entrega volta às 9h" quando a logística fechada tem hora de volta', async () => {
    const when = at(1, 9);
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...storeCard().delivery, available: false, unavailableReason: 'LOGISTICS_CLOSED', logisticsOpensAt: when } })} testID="row" />);
    expect(screen.getByTestId('store-card.delivery-back')).toHaveTextContent('Entrega volta amanhã às 9h');
    expect(screen.getByTestId('row').props.accessibilityLabel).toContain('Entrega volta amanhã às 9h');
  });

  it('cartão da loja sem causa conhecida diz "Entrega indisponível", nunca "Fora da área" por omissão (WB-260 C4)', async () => {
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...storeCard().delivery, available: false } })} testID="row" />);
    expect(screen.getByText('Entrega indisponível')).toBeOnTheScreen();
    expect(screen.queryByText('Fora da área de entrega')).toBeNull();
    expect(screen.queryByTestId('store-card.delivery-back')).toBeNull();
  });

  it('cartão da loja fora do alcance (OUT_OF_RANGE, loja além do teto da faixa) diz "Longe demais para entregar"', async () => {
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...storeCard().delivery, available: false, unavailableReason: 'OUT_OF_RANGE', etaMaxMinutes: 200 } })} testID="row" />);
    expect(screen.getByText('Longe demais para entregar')).toBeOnTheScreen();
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

describe('Motivo real da entrega indisponível (WB-260: StoreDelivery.unavailableReason do contrato)', () => {
  const base = { ...storeCard().delivery, available: false };

  it('OUT_OF_RANGE: "Longe demais para entregar", mesmo com hora de logística no payload', async () => {
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...base, unavailableReason: 'OUT_OF_RANGE' } })} testID="row" />);
    expect(screen.getByText('Longe demais para entregar')).toBeOnTheScreen();
  });

  it('LOGISTICS_CLOSED com hora: "Entrega volta amanhã às 9h"; sem hora, "Entrega fechada agora" (não inventa hora)', async () => {
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...base, unavailableReason: 'LOGISTICS_CLOSED', logisticsOpensAt: at(1, 9) } })} testID="row" />);
    expect(screen.getByTestId('store-card.delivery-back')).toHaveTextContent('Entrega volta amanhã às 9h');
  });

  it('LOGISTICS_PAUSED sem previsão: "Entrega pausada", nunca "fora da área"', async () => {
    await renderScreen(<StoreRow onPress={jest.fn()} store={storeCard({ delivery: { ...base, unavailableReason: 'LOGISTICS_PAUSED' } })} testID="row" />);
    expect(screen.getByText('Entrega pausada')).toBeOnTheScreen();
    expect(screen.queryByText(/fora da área/i)).toBeNull();
  });

  it('textos por causa (função pura); sem causa ou valor novo do servidor vira "indisponível", nunca "fora da área"', () => {
    expect(deliveryUnavailable({ unavailableReason: 'OUT_OF_RANGE' }).title).toBe('Longe demais para entregar no seu endereço');
    expect(deliveryUnavailable({ unavailableReason: 'LOGISTICS_PAUSED' }).title).toBe('Entregas pausadas agora');
    expect(deliveryUnavailable({ unavailableReason: 'LOGISTICS_PAUSED', logisticsOpensAt: at(0, 17) }, { now: NOON }).title).toBe('Entregas pausadas agora, voltam às 17h');
    expect(deliveryUnavailable({ unavailableReason: 'LOGISTICS_CLOSED', logisticsOpensAt: at(0, 17) }, { now: NOON }).title).toBe('Entregas voltam às 17h');
    expect(deliveryUnavailable({ unavailableReason: 'LOGISTICS_CLOSED' }).title).toBe('Entregas fechadas agora');
    expect(deliveryUnavailable({ unavailableReason: 'NOVO_MOTIVO' }).kind).toBe('unknown');
    expect(deliveryUnavailable({ unavailableReason: null }).title).toBe('Entrega indisponível agora');
    // o app não deduz a causa de `logisticsOpensAt` sozinho: quem diz é o servidor
    expect(deliveryUnavailable({ logisticsOpensAt: at(0, 17) }).kind).toBe('unknown');
  });
});
