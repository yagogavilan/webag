import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { sessionStore } from '../src/api/session';
import { deliveryEta, etaFromBody, etaLabel, etaWindow } from '../src/features/catalog/eta';
import { stepOf } from '../src/features/orders/OrderHero';
import { ReportButton } from '../src/features/report/ReportSheet';
import { renderScreen } from '../src/test/render';

const mockSend = jest.fn();
jest.mock('../src/api/privacy-api', () => ({ sendReport: (...a: unknown[]) => mockSend(...a) }));

describe('DEC-053: faixa de chegada, nunca número único', () => {
  const from = new Date(2026, 10, 19, 14, 7, 0);
  it('ancora os minutos no relógio em múltiplos de 5 (início para baixo, fim para cima)', () => {
    expect(etaWindow(40, 70, from)).toEqual({ start: '14:45', end: '15:20' });
    expect(etaLabel({ etaMinMinutes: 40, etaMaxMinutes: 70 }, from)).toBe('Chega entre 14:45 e 15:20');
  });
  it('usa a faixa do servidor quando existe', () => {
    const eta = { fromAt: new Date(2026, 10, 19, 15, 40).toISOString(), toAt: new Date(2026, 10, 19, 16, 40).toISOString() };
    expect(deliveryEta({ etaMinMinutes: 1, etaMaxMinutes: 2, eta }, from)).toEqual({ start: '15:40', end: '16:40' });
    expect(etaFromBody({ eta })).toEqual(eta);
    expect(etaFromBody({})).toBeNull();
    expect(etaFromBody({ eta: { fromAt: 1 } })).toBeNull();
  });
  it('loja fora do alcance de 120 min (ou sem entrega no endereço) é "fora da área"', () => {
    expect(deliveryEta({ etaMinMinutes: 100, etaMaxMinutes: 135 }, from)).toBeNull();
    expect(deliveryEta({ etaMinMinutes: 20, etaMaxMinutes: 40, available: false }, from)).toBeNull();
    expect(deliveryEta({ etaMinMinutes: 60, etaMaxMinutes: 120 }, from)).not.toBeNull();
  });
  it('etapas do acompanhamento', () => {
    expect(stepOf('received')).toBe(1);
    expect(stepOf('out_for_delivery')).toBe(4);
    expect(stepOf('delivered')).toBe(5);
    expect(stepOf('cancelled')).toBe(0);
  });
});

describe('DN1. Denunciar', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });
  });

  it('sem motivo diz "Escolha um motivo."; com motivo envia e mostra a mesma frase de sempre', async () => {
    mockSend.mockResolvedValue({ received: true });
    await renderScreen(<ReportButton target="product" targetId="p1" testID="report.open" />);
    await fireEvent.press(screen.getByTestId('report.open'));
    await fireEvent.press(await screen.findByTestId('report.submit'));
    expect(await screen.findByText('Escolha um motivo.')).toBeOnTheScreen();
    expect(mockSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('report.reason-scam'));
    await fireEvent.changeText(screen.getByTestId('report.text'), 'Pede pagamento fora do app');
    await fireEvent.press(screen.getByTestId('report.submit'));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith({ targetType: 'product', targetId: 'p1', reason: 'scam', text: 'Pede pagamento fora do app' }));
    expect(await screen.findByText('Recebemos. Vamos analisar.')).toBeOnTheScreen();
  });

  it('avaliação não oferece "produto proibido"', async () => {
    await renderScreen(<ReportButton target="review" targetId="r1" testID="report.open" />);
    await fireEvent.press(screen.getByTestId('report.open'));
    await screen.findByTestId('report.submit');
    expect(screen.queryByTestId('report.reason-prohibited')).toBeNull();
    expect(screen.getByTestId('report.reason-offensive')).toBeOnTheScreen();
  });
});
