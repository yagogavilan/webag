/* eslint-disable @typescript-eslint/no-misused-promises -- os mocks de `fetch` devolvem Promise de propósito */
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheService } from '../../platform/cache/cache.service.js';
import type { Env } from '../../platform/config/env.js';
import { FakeGeocodingProvider, HttpGeocodingProvider } from './geocoding.js';

/** Cache em memória com a mesma assinatura do `CacheService.wrap` (TTL fixo ou decidido pelo valor). */
class MemoryCache {
  readonly store = new Map<string, { value: unknown; ttl: number }>();
  async wrap<T>(namespace: string, key: string, ttl: number | ((v: T) => number), compute: () => Promise<T>): Promise<T> {
    const full = `${namespace}:${key}`;
    const hit = this.store.get(full);
    if (hit) return hit.value as T;
    const value = await compute();
    this.store.set(full, { value, ttl: typeof ttl === 'function' ? ttl(value) : ttl });
    return value;
  }
}

const config = (env: Partial<Record<'GEOCODER_URL' | 'GEOCODER_API_KEY', string>>) => ({ get: (key: string) => (env as Record<string, string | undefined>)[key] }) as unknown as ConfigService<Env, true>;
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const VIA = { logradouro: 'Rua das Flores', bairro: 'Centro', localidade: 'Francisco Morato', uf: 'SP' };

describe('HttpGeocodingProvider (SEC-169)', () => {
  let cache: MemoryCache;
  let fetchMock: ReturnType<typeof vi.fn>;
  const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
  const make = (env: Parameters<typeof config>[0] = {}) => new HttpGeocodingProvider(config(env), cache as unknown as CacheService);

  beforeEach(() => {
    cache = new MemoryCache();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sem GEOCODER_URL (padrão): só o ViaCEP é consultado; o centro é nulo e o Nominatim público NUNCA é chamado', async () => {
    fetchMock.mockImplementation(() => json(VIA));
    const provider = make();
    const info = await provider.lookupCep('07900-100');
    expect(info).toEqual({ cep: '07900100', street: 'Rua das Flores', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' });
    expect(await provider.centerOf(info!)).toBeNull();
    const full = await provider.lookup('07900100');
    expect(full).toMatchObject({ city: 'Francisco Morato', lat: null, lng: null });
    expect(urls().every((u) => new URL(u).hostname === 'viacep.com.br')).toBe(true);
    expect(urls().some((u) => /openstreetmap/i.test(u))).toBe(false);
    expect(urls()).toHaveLength(1); // as duas consultas seguintes saíram do cache
  });

  it('CEP inexistente (ViaCEP `erro`) vira null e fica em cache por pouco tempo; CEP válido, por 30 dias', async () => {
    fetchMock.mockImplementationOnce(() => json({ erro: 'true' })).mockImplementationOnce(() => json(VIA));
    const provider = make();
    expect(await provider.lookupCep('00012345')).toBeNull();
    expect(await provider.lookupCep('00012345')).toBeNull();
    await provider.lookupCep('07900100');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.store.get('geo-cep:00012345')!.ttl).toBe(86_400);
    expect(cache.store.get('geo-cep:07900100')!.ttl).toBe(30 * 86_400);
  });

  it('ViaCEP fora do ar: lança (o endereço é aceito sem conferir), não grava no cache e não insiste por 1 min', async () => {
    fetchMock.mockImplementation(() => json({}, 503));
    const provider = make();
    await expect(provider.lookupCep('07900100')).rejects.toMatchObject({ code: 'GEOCODING_UNAVAILABLE' });
    await expect(provider.lookupCep('07900101')).rejects.toMatchObject({ code: 'GEOCODING_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // o segundo nem tentou
    expect(cache.store.size).toBe(0);
  });

  it('com GEOCODER_URL: consulta só rua, cidade e UF do CEP (sem número nem dado de conta), envia a chave, valida a caixa do Brasil e usa cache', async () => {
    fetchMock.mockImplementation((url: string) => (url.includes('viacep') ? json(VIA) : json([{ lat: '-23.2811', lon: '-46.7452' }])));
    const provider = make({ GEOCODER_URL: 'https://geocoder.webag.com.br/search', GEOCODER_API_KEY: 'chave-do-provedor-123' });
    const full = await provider.lookup('07900100');
    expect(full).toMatchObject({ lat: -23.2811, lng: -46.7452 });
    await provider.lookup('07900100');
    const geo = urls().filter((u) => u.startsWith('https://geocoder.webag.com.br/'));
    expect(geo).toHaveLength(1); // cache por CEP
    const query = new URL(geo[0]!).searchParams;
    expect([...query.keys()].sort()).toEqual(['city', 'country', 'format', 'key', 'limit', 'state', 'street']);
    expect(query.get('street')).toBe('Rua das Flores');
    expect(query.get('key')).toBe('chave-do-provedor-123');
    expect(urls().some((u) => /openstreetmap/i.test(u))).toBe(false);
  });

  it('coordenada fora do Brasil ou sem resultado = null (e "não achou" é cacheado por pouco tempo)', async () => {
    fetchMock.mockImplementation((url: string) => (url.includes('viacep') ? json(VIA) : json([{ lat: '48.85', lon: '2.35' }])));
    const provider = make({ GEOCODER_URL: 'https://geocoder.webag.com.br/search' });
    expect(await provider.lookup('07900100')).toMatchObject({ lat: null, lng: null });
    expect(cache.store.get('geo-center:07900100')).toMatchObject({ value: null, ttl: 86_400 });
  });

  it('geocodificador fora do ar: centerOf devolve null SEM lançar, sem cache e com recuo de 1 min', async () => {
    fetchMock.mockImplementation((url: string) => (url.includes('viacep') ? json(VIA) : json({}, 500)));
    const provider = make({ GEOCODER_URL: 'https://geocoder.webag.com.br/search' });
    const info = (await provider.lookupCep('07900100'))!;
    expect(await provider.centerOf(info)).toBeNull();
    expect(await provider.centerOf({ ...info, cep: '07900101' })).toBeNull();
    expect(urls().filter((u) => u.includes('geocoder.webag'))).toHaveLength(1);
    expect(cache.store.has('geo-center:07900100')).toBe(false);
  });
});

describe('FakeGeocodingProvider', () => {
  it('prefixo 000 = CEP inexistente; CEP atendido tem centro determinístico; lookup junta os dois', async () => {
    const fake = new FakeGeocodingProvider();
    expect(await fake.lookupCep('00012-345')).toBeNull();
    expect(await fake.lookup('00012345')).toBeNull();
    const info = (await fake.lookupCep('07900100'))!;
    expect(info.city).toBe('Francisco Morato');
    const center = (await fake.centerOf(info))!;
    expect(await fake.lookup('07900100')).toMatchObject({ lat: center.lat, lng: center.lng });
  });
});
