import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { MAX_ADDRESSES, type Address } from './types';

/**
 * Endereços guardados NO APARELHO. Motivo: o contrato (`openapi.yaml`) ainda não tem `/v1/me/addresses` (pendência com o
 * backend-dev). Quando existir, este módulo vira cache e o servidor passa a ser a fonte (a lista do logado sobrevive a troca de aparelho).
 * Segurança: endereço é dado pessoal, então fica só no sandbox do app, nunca em log nem em analytics, e é apagado ao sair da conta
 * (`clearAll`). Credenciais NÃO passam por aqui (ficam em expo-secure-store).
 */
const KEY = 'webag.addresses.v1';

interface Persisted {
  addresses: Address[];
  currentId: string | null;
}

export type AddressState = { status: 'loading' } | ({ status: 'ready' } & Persisted);

let state: AddressState = { status: 'loading' };
const listeners = new Set<() => void>();

function emit(next: AddressState): void {
  state = next;
  listeners.forEach((l) => l());
}

function isAddress(value: unknown): value is Address {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.city === 'string' && typeof v.street === 'string' && typeof v.precision === 'string';
}

async function persist(next: Persisted): Promise<void> {
  emit({ status: 'ready', ...next });
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

const snapshot = (): Persisted => (state.status === 'ready' ? { addresses: state.addresses, currentId: state.currentId } : { addresses: [], currentId: null });

export const addressStore = {
  getState: (): AddressState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async hydrate(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
      const addresses = Array.isArray(parsed.addresses) ? parsed.addresses.filter(isAddress).slice(0, MAX_ADDRESSES) : [];
      const currentId = addresses.some((a) => a.id === parsed.currentId) ? (parsed.currentId ?? null) : null;
      emit({ status: 'ready', addresses, currentId });
    } catch {
      emit({ status: 'ready', addresses: [], currentId: null });
    }
  },

  /** Guarda um endereço novo e o torna o atual. Devolve null se estourou o limite de 8. */
  async add(input: Omit<Address, 'id'>): Promise<Address | null> {
    const { addresses } = snapshot();
    // aproximado (GPS/cidade) substitui o aproximado anterior: não ocupa vaga da lista
    const kept = input.precision === 'approx' ? addresses.filter((a) => a.precision !== 'approx') : addresses;
    if (kept.length >= MAX_ADDRESSES) return null;
    const address: Address = { ...input, id: randomUUID() };
    await persist({ addresses: [address, ...kept], currentId: address.id });
    return address;
  },

  async update(id: string, patch: Partial<Omit<Address, 'id'>>): Promise<void> {
    const { addresses, currentId } = snapshot();
    await persist({ addresses: addresses.map((a) => (a.id === id ? { ...a, ...patch } : a)), currentId });
  },

  async setCurrent(id: string): Promise<void> {
    const { addresses } = snapshot();
    if (!addresses.some((a) => a.id === id)) return;
    await persist({ addresses, currentId: id });
  },

  /** Remove e devolve se ainda há algum endereço atual (se não, a tela volta ao D1). */
  async remove(id: string): Promise<{ hasCurrent: boolean; wasCurrent: boolean }> {
    const { addresses, currentId } = snapshot();
    const rest = addresses.filter((a) => a.id !== id);
    const wasCurrent = currentId === id;
    const nextCurrent = wasCurrent ? null : currentId;
    await persist({ addresses: rest, currentId: nextCurrent });
    return { hasCurrent: nextCurrent !== null, wasCurrent };
  },

  /** Sair da conta: dado pessoal não fica no aparelho. */
  async clearAll(): Promise<void> {
    emit({ status: 'ready', addresses: [], currentId: null });
    await AsyncStorage.removeItem(KEY);
  },
};

export function useAddresses(): AddressState {
  return useSyncExternalStore(addressStore.subscribe, addressStore.getState, addressStore.getState);
}

export function useCurrentAddress(): Address | null {
  const s = useAddresses();
  if (s.status !== 'ready') return null;
  return s.addresses.find((a) => a.id === s.currentId) ?? null;
}
