import { sessionStore } from '../src/api/session';
import { ApiError } from '../src/api/problem';
import { addressStore } from '../src/features/address/store';
import { syncAddresses } from '../src/features/address/sync';
import type { Address } from '../src/features/address/types';

const mockFetch = jest.fn();
const mockCreate = jest.fn();
jest.mock('../src/api/addresses-api', () => ({
  fetchAddresses: () => mockFetch(),
  createRemoteAddress: (f: unknown) => mockCreate(f),
}));

const base: Omit<Address, 'id'> = {
  nickname: null, precision: 'full', cep: '07900000', street: 'Rua das Palmeiras', number: '120', noNumber: false, complement: '',
  district: 'Jardim Fortaleza', city: 'Francisco Morato', state: 'SP', latitude: null, longitude: null,
};
const server = (id: string, number: string): Address => ({ ...base, id, number, remote: true, latitude: -23.28, longitude: -46.74 });
const readyState = () => {
  const s = addressStore.getState();
  if (s.status !== 'ready') throw new Error('not ready');
  return s;
};

beforeEach(async () => {
  jest.clearAllMocks();
  await addressStore.clearAll();
  await addressStore.hydrate();
});

describe('endereços na API com cache local (T3A-05)', () => {
  it('migra o endereço do visitante para a conta e passa a usar a lista do servidor', async () => {
    const local = await addressStore.add(base);
    mockCreate.mockResolvedValue(server('srv-1', '120'));
    mockFetch.mockResolvedValue([server('srv-1', '120'), server('srv-2', '5')]);

    await syncAddresses('user-1');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ street: 'Rua das Palmeiras', number: '120' });
    const s = readyState();
    expect(s.ownerId).toBe('user-1');
    expect(s.addresses.map((a) => a.id)).toEqual(['srv-1', 'srv-2']);
    // o atual (que era o local) segue o endereço migrado
    expect(s.currentId).toBe('srv-1');
    expect(local?.id).not.toBe('srv-1');
  });

  it('mantém o endereço aproximado (GPS/cidade) e o atual quando a lista do servidor chega', async () => {
    const approx = await addressStore.add({ ...base, precision: 'approx', street: '', number: '', cep: '' });
    mockFetch.mockResolvedValue([server('srv-1', '120')]);
    await syncAddresses('user-1');
    const s = readyState();
    expect(s.addresses.map((a) => a.id)).toEqual([approx?.id, 'srv-1']);
    expect(s.currentId).toBe(approx?.id);
  });

  it('sem rede não apaga o cache', async () => {
    await addressStore.bindOwner('user-1');
    await addressStore.upsert(server('srv-1', '120'), { makeCurrent: true });
    mockFetch.mockRejectedValue(new ApiError({ kind: 'network' }));
    await syncAddresses('user-1');
    expect(readyState().addresses.map((a) => a.id)).toEqual(['srv-1']);
  });

  it('SEC-122: outro usuário no mesmo aparelho não herda os endereços do anterior', async () => {
    await addressStore.bindOwner('user-1');
    await addressStore.upsert(server('srv-1', '120'), { makeCurrent: true });
    mockFetch.mockResolvedValue([server('srv-9', '9')]);
    await syncAddresses('user-2');
    const s = readyState();
    expect(s.ownerId).toBe('user-2');
    expect(s.addresses.map((a) => a.id)).toEqual(['srv-9']);
  });

  it('SEC-122: sessão encerrada (sair, expirar ou reuso do refresh) apaga os endereços do aparelho', async () => {
    await addressStore.bindOwner('user-1');
    await addressStore.upsert(server('srv-1', '120'), { makeCurrent: true });
    await sessionStore.clear('expired');
    const s = readyState();
    expect(s.addresses).toEqual([]);
    expect(s.currentId).toBeNull();
    expect(s.ownerId).toBeNull();
  });

  it('visitante que entra herda o que digitou; bindOwner(null) com dono apaga', async () => {
    await addressStore.add(base);
    await addressStore.bindOwner('user-1');
    expect(readyState().addresses).toHaveLength(1);
    await addressStore.bindOwner(null);
    expect(readyState().addresses).toEqual([]);
  });
});
