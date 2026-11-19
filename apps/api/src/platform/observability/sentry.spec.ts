import type { ErrorEvent } from '@sentry/node';
import { captureError, initSentry, scrubEvent, sentryEnabled } from './sentry.js';

describe('Sentry (DT-039)', () => {
  it('sem DSN fica desligado e capturar erro não faz nada', () => {
    expect(initSentry({ dsn: undefined, environment: 'test', tracesSampleRate: 0 })).toBe(false);
    expect(sentryEnabled()).toBe(false);
    expect(() => captureError(new Error('x'), 'req-1')).not.toThrow();
  });

  it('scrubEvent remove corpo, cookies, cabeçalhos sensíveis, usuário e mascara e-mail, telefone e coordenadas', () => {
    const event = {
      type: undefined,
      user: { id: 'u1', email: 'maria@exemplo.com', ip_address: '1.2.3.4' },
      server_name: 'host',
      message: 'falha ao enviar para maria@exemplo.com ou (11) 98888-7777',
      exception: { values: [{ type: 'Error', value: 'smtp rejeitou joao.silva@dominio.com.br' }] },
      request: {
        url: 'https://api.webag.com.br/v1/stores?lat=-23.28&lng=-46.74&q=pao',
        query_string: 'lat=-23.28&lng=-46.74&q=pao',
        data: { cpf: '12345678900', cardToken: 'abc' },
        cookies: { sid: '1' },
        headers: { Authorization: 'Bearer abc', 'X-Signature': 'ts=1,v1=aa', Accept: 'application/json', 'Idempotency-Key': 'k' },
      },
      breadcrumbs: [{ message: 'mail a@b.co', data: { to: 'a@b.co' } }],
      extra: { payer: 'maria@exemplo.com' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    const json = JSON.stringify(out);
    for (const leak of ['maria@exemplo.com', 'joao.silva@dominio', '98888', '12345678900', 'abc', '1.2.3.4', 'ts=1', '-23.28', '-46.74', 'a@b.co']) expect(json, leak).not.toContain(leak);
    expect(out.request?.headers).toEqual({ Accept: 'application/json' });
    expect(out.request?.url).toContain('q=pao');
  });
});
