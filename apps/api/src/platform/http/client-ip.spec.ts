import { bffClientIp, parseTrustProxy } from './client-ip.js';

describe('parseTrustProxy (SEC-114)', () => {
  it('aceita saltos de 0 a 5 e lista de IP/CIDR', () => {
    expect(parseTrustProxy('1').value).toBe(1);
    expect(parseTrustProxy('0').value).toBe(0);
    expect(parseTrustProxy('127.0.0.1, 10.0.0.0/8 ,fd00::/8').value).toEqual(['127.0.0.1', '10.0.0.0/8', 'fd00::/8']);
    expect(parseTrustProxy(undefined).value).toBeUndefined();
  });

  it.each(['6', 'true', 'abc', '10.0.0.0/33', '0.0.0.0/0', '10.0.0.0/0', '0.0.0.0', '::', '1.2.3.4/8/9', '10.0.0.0/x'])('recusa %s', (raw) => {
    expect(parseTrustProxy(raw).error).toBeDefined();
  });
});

describe('bffClientIp', () => {
  const run = (secret: string | undefined, headers: Record<string, string>) => {
    const req = { headers: { ...headers }, ip: '10.0.0.9' } as unknown as Parameters<ReturnType<typeof bffClientIp>>[0];
    bffClientIp(secret)(req, {} as never, () => undefined);
    return req;
  };

  it('com o segredo certo, usa o IP informado e remove o segredo', () => {
    const req = run('s'.repeat(32), { 'x-webag-bff-secret': 's'.repeat(32), 'x-webag-client-ip': '203.0.113.7' });
    expect(req.ip).toBe('203.0.113.7');
    expect(req.headers['x-webag-bff-secret']).toBeUndefined();
  });

  it.each([
    ['segredo errado', 's'.repeat(32), { 'x-webag-bff-secret': 'x'.repeat(32), 'x-webag-client-ip': '203.0.113.7' }],
    ['sem segredo configurado', undefined, { 'x-webag-bff-secret': 'x', 'x-webag-client-ip': '203.0.113.7' }],
    ['sem segredo no pedido', 's'.repeat(32), { 'x-webag-client-ip': '203.0.113.7' }],
    ['IP inválido', 's'.repeat(32), { 'x-webag-bff-secret': 's'.repeat(32), 'x-webag-client-ip': 'nao-e-ip' }],
  ])('ignora o IP informado: %s', (_name, secret, headers) => {
    expect(run(secret, headers).ip).toBe('10.0.0.9');
  });
});
