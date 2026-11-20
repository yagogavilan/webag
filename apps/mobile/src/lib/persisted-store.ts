import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Estado pequeno do aparelho (modo de entrega, sacola, histórico de busca): um valor, persistido em AsyncStorage, com hook de leitura.
 * Dado de SERVIDOR não entra aqui (fica no TanStack Query). Nada sensível: tokens vão para o expo-secure-store.
 */
export interface PersistedStore<T> {
  get: () => T;
  isReady: () => boolean;
  set: (next: T | ((prev: T) => T)) => Promise<void>;
  hydrate: () => Promise<void>;
  reset: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  /** Valor atual; reage a mudanças. */
  useValue: () => T;
  /** false até ler o AsyncStorage (para não sobrescrever o que estava salvo). */
  useReady: () => boolean;
}

export function createPersistedStore<T>(key: string, initial: T, parse: (raw: unknown) => T): PersistedStore<T> {
  let value = initial;
  let ready = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const store: PersistedStore<T> = {
    get: () => value,
    isReady: () => ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async hydrate() {
      try {
        const raw = await AsyncStorage.getItem(key);
        value = raw ? parse(JSON.parse(raw)) : initial;
      } catch {
        value = initial;
      }
      ready = true;
      emit();
    },
    async set(next) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      emit();
      try {
        await AsyncStorage.setItem(key, JSON.stringify(value));
      } catch {
        // disco cheio: o valor em memória continua valendo nesta sessão
      }
    },
    async reset() {
      value = initial;
      emit();
      await AsyncStorage.removeItem(key).catch(() => undefined);
    },
    useValue() {
      return useSyncExternalStore(store.subscribe, store.get, store.get);
    },
    useReady() {
      return useSyncExternalStore(store.subscribe, store.isReady, store.isReady);
    },
  };
  return store;
}
