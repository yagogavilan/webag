'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { merchantApi, type MerchantStore } from '@/lib/api/lojista';
import type { Me } from '@/lib/session-types';

export const STORE_KEY = ['lojista', 'store'] as const;

interface Value {
  user: Me;
  /** `data` é `null` quando o usuário ainda não começou o cadastro da loja. */
  store: UseQueryResult<MerchantStore | null>;
}

const Context = createContext<Value | null>(null);

export function StoreProvider({ user, children }: { user: Me; children: ReactNode }) {
  const store = useQuery({ queryKey: STORE_KEY, queryFn: merchantApi.store, staleTime: 15_000 });
  return <Context.Provider value={{ user, store }}>{children}</Context.Provider>;
}

export function useMerchant(): Value {
  const value = useContext(Context);
  if (!value) throw new Error('useMerchant fora do StoreProvider');
  return value;
}
