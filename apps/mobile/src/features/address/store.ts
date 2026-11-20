import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { onSessionCleared } from '../../api/session';
import { MAX_ADDRESSES, type Address } from './types';

/**
 * Cache local dos endereços + o endereço atual (que é escolha do aparelho, pode ser aproximado e nunca vai à API).
 * Quem está logado tem a lista na API (`/v1/me/addresses`, DEC-028 c): aqui ela é só cache para abrir o app sem rede.
 * Visitante: a lista vive só aqui, e migra para a conta no login (`sync.ts`).
 *
 * Segurança (SEC-122): o cache tem DONO (`ownerId`). Sessão encerrada por qualquer motivo, ou outro usuário no mesmo aparelho,
 * apaga tudo. Endereço é dado pessoal: sem log, sem analytics. Credenciais NÃO passam por aqui (expo-secure-store).
 */
const KEY = 'webag.addresses.v1';

interface Persisted {
  addresses: Address[];
  currentId: string | null;
  /** Usuário dono do cache; null = visitante. */
  ownerId: string | null;
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

const snapshot = (): Persisted =>
  state.status === 'ready'
    ? { addresses: state.addresses, currentId: state.currentId, ownerId: state.ownerId }
    : { addresses: [], currentId: null, ownerId: null };

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
      const addresses = Array.isArray(parsed.addresses) ? parsed.addresses.filter(isAddress).slice(0, MAX_ADDRESSES + 1) : [];
      const currentId = addresses.some((a) => a.id === parsed.currentId) ? (parsed.currentId ?? null) : null;
      const ownerId = typeof parsed.ownerId === 'string' ? parsed.ownerId : null;
      emit({ status: 'ready', addresses, currentId, ownerId });
    } catch {
      emit({ status: 'ready', addresses: [], currentId: null, ownerId: null });
    }
  },

  /**
   * Declara quem é o dono do cache (SEC-122). Outro usuário (ou sessão que acabou): apaga tudo.
   * Visitante que acabou de entrar: o que ele digitou como visitante passa a ser dele (e migra para a API).
   */
  async bindOwner(userId: string | null): Promise<void> {
    const { ownerId } = snapshot();
    if (ownerId === userId) return;
    if (ownerId !== null) {
      await this.clearAll();
      if (userId !== null) await persist({ addresses: [], currentId: null, ownerId: userId });
      return;
    }
    await persist({ ...snapshot(), ownerId: userId });
  },

  /** Guarda um endereço novo só no aparelho e o torna o atual. Devolve null se estourou o limite de 8. */
  async add(input: Omit<Address, 'id'>): Promise<Address | null> {
    const { addresses, ownerId } = snapshot();
    // aproximado (GPS/cidade) substitui o aproximado anterior: não ocupa vaga da lista
    const kept = input.precision === 'approx' ? addresses.filter((a) => a.precision !== 'approx') : addresses;
    if (kept.filter((a) => a.precision === 'full').length >= MAX_ADDRESSES) return null;
    const address: Address = { ...input, id: randomUUID() };
    await persist({ addresses: [address, ...kept], currentId: address.id, ownerId });
    return address;
  },

  /** Endereço que veio da API (já tem `id` do servidor): entra ou substitui no cache. */
  async upsert(address: Address, opts: { makeCurrent?: boolean; replaceId?: string } = {}): Promise<void> {
    const { addresses, currentId, ownerId } = snapshot();
    const without = addresses.filter((a) => a.id !== address.id && a.id !== opts.replaceId);
    const wasReplacedCurrent = opts.replaceId !== undefined && currentId === opts.replaceId;
    await persist({
      addresses: [address, ...without],
      currentId: opts.makeCurrent || wasReplacedCurrent ? address.id : currentId,
      ownerId,
    });
  },

  async update(id: string, patch: Partial<Omit<Address, 'id'>>): Promise<void> {
    const { addresses, currentId, ownerId } = snapshot();
    await persist({ addresses: addresses.map((a) => (a.id === id ? { ...a, ...patch } : a)), currentId, ownerId });
  },

  async setCurrent(id: string): Promise<void> {
    const { addresses, ownerId } = snapshot();
    if (!addresses.some((a) => a.id === id)) return;
    await persist({ addresses, currentId: id, ownerId });
  },

  /**
   * Troca a lista de endereços completos pelo que o servidor devolveu (a API é a fonte). Aproximado (GPS/cidade) fica.
   * `idMap` leva o atual de um id local para o id novo quando o endereço foi migrado agora.
   */
  async applyServerList(server: Address[], idMap: ReadonlyMap<string, string> = new Map()): Promise<void> {
    const { addresses, currentId, ownerId } = snapshot();
    const approx = addresses.filter((a) => a.precision === 'approx');
    const next = [...approx, ...server];
    const mapped = currentId ? (idMap.get(currentId) ?? currentId) : null;
    const nextCurrent = mapped && next.some((a) => a.id === mapped) ? mapped : (server[0]?.id ?? approx[0]?.id ?? null);
    await persist({ addresses: next, currentId: nextCurrent, ownerId });
  },

  /** Remove e devolve se ainda há algum endereço atual (se não, a tela volta ao D1). */
  async remove(id: string): Promise<{ hasCurrent: boolean; wasCurrent: boolean }> {
    const { addresses, currentId, ownerId } = snapshot();
    const rest = addresses.filter((a) => a.id !== id);
    const wasCurrent = currentId === id;
    const nextCurrent = wasCurrent ? null : currentId;
    await persist({ addresses: rest, currentId: nextCurrent, ownerId });
    return { hasCurrent: nextCurrent !== null, wasCurrent };
  },

  /** Sair da conta, sessão derrubada ou outro usuário: dado pessoal não fica no aparelho. */
  async clearAll(): Promise<void> {
    emit({ status: 'ready', addresses: [], currentId: null, ownerId: null });
    await AsyncStorage.removeItem(KEY);
  },
};

// SEC-122: qualquer encerramento de sessão (sair, expirar, reuso do refresh) apaga os endereços do aparelho.
onSessionCleared(() => addressStore.clearAll());

export function useAddresses(): AddressState {
  return useSyncExternalStore(addressStore.subscribe, addressStore.getState, addressStore.getState);
}

export function useCurrentAddress(): Address | null {
  const s = useAddresses();
  if (s.status !== 'ready') return null;
  return s.addresses.find((a) => a.id === s.currentId) ?? null;
}
