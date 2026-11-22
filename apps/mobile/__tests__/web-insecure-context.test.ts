import { installInsecureContextShims } from '../src/lib/web-insecure-context.web';

describe('web-insecure-context (navegador em http na rede local)', () => {
  it('cria crypto.randomUUID (v4) só quando ele não existe', () => {
    const cryptoApi: { getRandomValues: (a: Uint8Array) => Uint8Array; randomUUID?: () => string } = {
      getRandomValues: (array) => array.map((_, index) => (index * 37 + 11) % 256) as unknown as Uint8Array,
    };
    installInsecureContextShims({ crypto: cryptoApi });
    const id = cryptoApi.randomUUID!();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('não substitui o randomUUID original', () => {
    const original = () => 'original';
    const cryptoApi = { getRandomValues: (a: Uint8Array) => a, randomUUID: original };
    installInsecureContextShims({ crypto: cryptoApi });
    expect(cryptoApi.randomUUID).toBe(original);
  });

  it('gera UUIDs diferentes com bytes aleatórios diferentes', () => {
    const cryptoApi: { getRandomValues: (a: Uint8Array) => Uint8Array; randomUUID?: () => string } = {
      getRandomValues: (array) => {
        for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
        return array;
      },
    };
    installInsecureContextShims({ crypto: cryptoApi });
    expect(cryptoApi.randomUUID!()).not.toBe(cryptoApi.randomUUID!());
  });
});
