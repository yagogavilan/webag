import type { Redis } from 'ioredis';
import type { CacheService } from './cache.service.js';
import { StorefrontCacheService, type StorefrontEvent } from './storefront-cache.service.js';

function build(options: { redisFails?: boolean } = {}) {
  const published: string[] = [];
  const bumped: string[] = [];
  const redis = {
    options: { db: 3 },
    publish: (_channel: string, message: string) => (options.redisFails ? Promise.reject(new Error('redis fora')) : Promise.resolve(published.push(message))),
  } as unknown as Redis;
  const cache = { bump: (namespace: string) => Promise.resolve(bumped.push(namespace)) } as unknown as CacheService;
  return { service: new StorefrontCacheService(redis, cache), published, bumped };
}

describe('StorefrontCacheService (DEC-113)', () => {
  it('o canal leva o número do banco do Redis (o pub/sub vale para o servidor inteiro)', () => {
    expect(build().service.channel).toBe('webag:storefront:invalidate:3');
  });

  it('moderação e loja apagam o cache local, invalidam o `home` e o `feed` do Redis e publicam; mudança comercial só apaga o local e publica', async () => {
    const { service, published, bumped } = build();
    const seen: StorefrontEvent[] = [];
    service.register((event) => seen.push(event));
    await service.takedown('s1', 'p1');
    await service.storeChanged('s1');
    expect(bumped).toEqual(['home', 'feed', 'home', 'feed']);
    await service.productsChanged('s1', ['p1']);
    expect(bumped).toHaveLength(4); // a home segue o TTL para preço e estoque
    expect(seen.map((event) => event.scope)).toEqual(['takedown', 'store', 'product']);
    expect(published).toHaveLength(3);
  });

  it('lista vazia de produtos não faz nada; nulo significa o catálogo inteiro da loja', async () => {
    const { service, published } = build();
    const seen: StorefrontEvent[] = [];
    service.register((event) => seen.push(event));
    await service.productsChanged('s1', []);
    expect(seen).toEqual([]);
    await service.productsChanged('s1', null);
    expect(seen).toEqual([{ scope: 'product', storeId: 's1', productIds: null }]);
    expect(published).toHaveLength(1);
  });

  it('falha aberta: Redis fora ou handler quebrado não derrubam quem invalidou, e os outros handlers rodam', async () => {
    const { service } = build({ redisFails: true });
    const seen: string[] = [];
    service.register(() => {
      throw new Error('handler quebrado');
    });
    service.register((event) => seen.push(event.scope));
    await expect(service.everythingChanged()).resolves.toBeUndefined();
    expect(seen).toEqual(['all']);
  });
});
