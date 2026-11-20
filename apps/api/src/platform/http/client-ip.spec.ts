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
  const SECRET = 's'.repeat(32);
  const run = (secret: string | undefined, headers: Record<string, string>) => {
    const req = { headers: { ...headers }, ip: '10.0.0.9', socket: { remoteAddress: '172.18.0.5' } } as unknown as Parameters<ReturnType<typeof bffClientIp>>[0];
    bffClientIp(secret)(req, {} as never, () => undefined);
    return req;
  };

  it('com o segredo certo, usa o IP do X-Forwarded-For e remove o segredo', () => {
    const req = run(SECRET, { 'x-webag-bff-secret': SECRET, 'x-forwarded-for': '203.0.113.7' });
    expect(req.ip).toBe('203.0.113.7');
    expect(req.headers['x-webag-bff-secret']).toBeUndefined();
  });

  it('com o segredo certo e lista, vale o primeiro; sem XFF (ou inválido), vale o IP da conexão', () => {
    expect(run(SECRET, { 'x-webag-bff-secret': SECRET, 'x-forwarded-for': '203.0.113.7, 172.18.0.5' }).ip).toBe('203.0.113.7');
    expect(run(SECRET, { 'x-webag-bff-secret': SECRET }).ip).toBe('172.18.0.5');
    expect(run(SECRET, { 'x-webag-bff-secret': SECRET, 'x-forwarded-for': 'lixo' }).ip).toBe('172.18.0.5');
  });

  it.each([
    ['segredo errado', SECRET, { 'x-webag-bff-secret': 'x'.repeat(32), 'x-forwarded-for': '203.0.113.7' }],
    ['sem segredo configurado', undefined, { 'x-webag-bff-secret': 'x', 'x-forwarded-for': '203.0.113.7' }],
    ['sem segredo no pedido', SECRET, { 'x-forwarded-for': '203.0.113.7' }],
  ])('não muda o IP resolvido pelo trust proxy: %s', (_name, secret, headers) => {
    expect(run(secret, headers).ip).toBe('10.0.0.9');
  });
});
