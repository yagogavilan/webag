import AsyncStorage from '@react-native-async-storage/async-storage';
import { lookupCep } from '../src/features/address/cep';
import { findActiveCity } from '../src/features/address/regions';
import { addressStore } from '../src/features/address/store';
import { addressArea, addressLine, MAX_ADDRESSES, type Address } from '../src/features/address/types';

const base: Omit<Address, 'id'> = {
  nickname: null,
  precision: 'full',
  cep: '07900000',
  street: 'Rua das Palmeiras',
  number: '120',
  noNumber: false,
  complement: '',
  district: 'Jardim Fortaleza',
  city: 'Francisco Morato',
  state: 'SP',
  latitude: null,
  longitude: null,
};

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('consulta de CEP (ViaCEP)', () => {
  it('preenche rua, bairro e cidade', async () => {
    const fetcher = jest.fn(() => ok({ logradouro: 'Rua das Palmeiras', bairro: 'Jardim Fortaleza', localidade: 'Francisco Morato', uf: 'SP' }));
    const result = await lookupCep('07900-000', fetcher as unknown as typeof fetch);
    expect(result).toEqual({ kind: 'found', value: { street: 'Rua das Palmeiras', district: 'Jardim Fortaleza', city: 'Francisco Morato', state: 'SP' } });
    expect(fetcher).toHaveBeenCalledWith('https://viacep.com.br/ws/07900000/json/', expect.anything());
  });

  it('CEP inexistente ({erro:true}) e HTTP 400 viram não encontrado', async () => {
    expect(await lookupCep('99999999', (() => ok({ erro: true })) as unknown as typeof fetch)).toEqual({ kind: 'not-found' });
    expect(await lookupCep('99999999', (() => ok({}, 400)) as unknown as typeof fetch)).toEqual({ kind: 'not-found' });
  });

  it('serviço fora do ar, rede ou resposta fora do formato viram indisponível, sem lançar', async () => {
    expect(await lookupCep('07900000', (() => Promise.reject(new TypeError('x'))) as unknown as typeof fetch)).toEqual({ kind: 'unavailable' });
    expect(await lookupCep('07900000', (() => ok({}, 503)) as unknown as typeof fetch)).toEqual({ kind: 'unavailable' });
    expect(await lookupCep('07900000', (() => ok({ localidade: 42 })) as unknown as typeof fetch)).toEqual({ kind: 'unavailable' });
  });

  it('não consulta CEP com menos de 8 dígitos', async () => {
    const fetcher = jest.fn();
    expect(await lookupCep('0790', fetcher as unknown as typeof fetch)).toEqual({ kind: 'not-found' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('região ativa', () => {
  const cities = [{ id: '1', name: 'Francisco Morato', state: 'SP', slug: 'francisco-morato', neighborhoods: [] }];
  it('compara cidade sem acento e sem diferenciar maiúsculas', () => {
    expect(findActiveCity(cities, 'francisco morató')?.id).toBe('1');
    expect(findActiveCity(cities, 'São Paulo')).toBeUndefined();
  });
});

describe('endereços guardados', () => {
  beforeEach(async () => {
    await addressStore.clearAll();
    await addressStore.hydrate();
  });

  it('o novo endereço vira o atual e sobrevive a reabrir o app', async () => {
    const created = await addressStore.add(base);
    expect(created?.id).toBeTruthy();
    await addressStore.hydrate();
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.currentId).toBe(created?.id);
  });

  it('limite de 8: o 9º é recusado', async () => {
    for (let i = 0; i < MAX_ADDRESSES; i++) expect(await addressStore.add({ ...base, number: String(i) })).not.toBeNull();
    expect(await addressStore.add(base)).toBeNull();
  });

  it('o endereço aproximado (GPS/cidade) não ocupa vaga e é substituído pelo seguinte', async () => {
    await addressStore.add({ ...base, precision: 'approx', street: '' });
    await addressStore.add({ ...base, precision: 'approx', street: '', city: 'Caieiras' });
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses).toHaveLength(1);
  });

  it('excluir o atual avisa que falta escolher; excluir o único zera tudo', async () => {
    const a = await addressStore.add(base);
    const b = await addressStore.add({ ...base, number: '200' });
    expect(await addressStore.remove(b!.id)).toEqual({ hasCurrent: false, wasCurrent: true });
    await addressStore.setCurrent(a!.id);
    expect(await addressStore.remove(a!.id)).toEqual({ hasCurrent: false, wasCurrent: true });
    const state = addressStore.getState();
    expect(state.status === 'ready' && state.addresses).toEqual([]);
  });

  it('sair da conta apaga os endereços do aparelho', async () => {
    await addressStore.add(base);
    await addressStore.clearAll();
    expect(await AsyncStorage.getItem('webag.addresses.v1')).toBeNull();
  });

  it('monta as linhas do seletor', () => {
    const a = { ...base, id: 'x' } as Address;
    expect(addressLine(a)).toBe('Rua das Palmeiras, 120');
    expect(addressArea(a)).toBe('Jardim Fortaleza, Francisco Morato');
    expect(addressLine({ ...a, noNumber: true })).toBe('Rua das Palmeiras');
    expect(addressLine({ ...a, precision: 'approx', street: '' })).toBe('Jardim Fortaleza');
  });
});
