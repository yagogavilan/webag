import { parsePushData } from '../src/features/notifications/open';

const ID = '11111111-1111-4111-8111-111111111111';

describe('push: só identificadores válidos viram ação (SEC-126)', () => {
  it('abre o pedido e conta a campanha', () => {
    expect(parsePushData({ orderId: ID, campaignId: ID })).toEqual({ campaignId: ID, route: { pathname: '/order/[id]', params: { id: ID } } });
  });
  it('abre a troca', () => {
    expect(parsePushData({ exchangeId: ID }).route).toEqual({ pathname: '/exchange/[id]', params: { id: ID } });
  });
  it('ignora URL, id mal formado e dado inesperado', () => {
    expect(parsePushData({ url: 'https://evil.example', orderId: '../../x', campaignId: 'abc' })).toEqual({ campaignId: null, route: null });
    expect(parsePushData(null)).toEqual({ campaignId: null, route: null });
  });
});
