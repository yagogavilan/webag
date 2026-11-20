'use client';

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useMerchant } from '@/features/lojista/store-context';
import { ordersApi, ordersKeys, type StoreOrderPage, type StoreOrderSummary } from '@/lib/api/orders';
import { ordersAvailable } from '@/lib/lojista-access';
import { createAlertSound, type AlertSound } from '@/lib/orders/alert-sound';
import { arrivedAt } from '@/lib/orders/status';
import { useRealtimeChannel } from '@/lib/realtime/use-realtime-channel';
import { exchangesKeys } from '@/lib/api/exchanges';
import { useOnline } from '@/lib/use-online';

/**
 * Sem o canal em tempo real (fallback): novos a cada 4 s e o resto a cada 10 s. Com o canal conectado, o evento chama `refresh()` e a
 * leitura vira só uma reserva lenta (WB-067 C1: o pedido aparece em até 3 s pelo Socket.IO).
 */
export const POLL_NEW_MS = 4000;
export const POLL_PROGRESS_MS = 10_000;
export const POLL_NEW_CONNECTED_MS = 30_000;
export const POLL_PROGRESS_CONNECTED_MS = 60_000;
/** O som repete a cada 15 s até a primeira ação (WB-067 C1) e fica mais forte a partir de 5 min (WB-068 C3). */
export const ALERT_REPEAT_MS = 15_000;
export const STRONG_AFTER_MS = 5 * 60_000;

export type WakeLockState = 'active' | 'unsupported' | 'off';

export interface OrdersRuntime {
  /** A loja pode receber pedidos e o usuário tem a permissão. Sem isso nada é consultado. */
  enabled: boolean;
  storeId: string | null;
  /** Pedidos aguardando a loja, o mais antigo primeiro. */
  pending: StoreOrderSummary[];
  /** Aceitos até prontos, o mais antigo primeiro. */
  inProgress: StoreOrderSummary[];
  newQuery: UseQueryResult<StoreOrderPage>;
  progressQuery: UseQueryResult<StoreOrderPage>;
  /** Canal em tempo real (Socket.IO por ticket) conectado. Sem ele, vale o polling. */
  realtimeConnected: boolean;
  /** Última sincronização bem-sucedida (ms); 0 se ainda não houve. */
  syncedAt: number;
  connectionLost: boolean;
  sound: { supported: boolean; enabled: boolean; enable: () => Promise<boolean>; test: () => void };
  wakeLock: WakeLockState;
  refresh: () => Promise<void>;
}

const Context = createContext<OrdersRuntime | null>(null);

export function useOrdersRuntime(): OrdersRuntime {
  const value = useContext(Context);
  if (!value) throw new Error('useOrdersRuntime fora do OrdersRuntimeProvider');
  return value;
}

/** Para telas que podem estar fora do painel completo (testes, fluxo de cadastro): sem o provedor, devolve `null`. */
export function useOptionalOrdersRuntime(): OrdersRuntime | null {
  return useContext(Context);
}

const byArrival = (a: StoreOrderSummary, b: StoreOrderSummary) => Date.parse(arrivedAt(a)) - Date.parse(arrivedAt(b));

/**
 * Motor do painel de pedidos: consulta (polling), alerta sonoro persistente, título da aba piscando, vibração e tela acesa.
 * Vive no painel inteiro (não só na tela de pedidos), para o lojista não perder pedido enquanto mexe no catálogo.
 * O evento do Socket.IO só chama `refresh()` (o REST é a verdade); o polling continua como reserva, lento com o canal e rápido sem ele.
 */
export function OrdersRuntimeProvider({ children, createSound = createAlertSound }: { children: ReactNode; createSound?: () => AlertSound }) {
  const { store } = useMerchant();
  const enabled = ordersAvailable(store.data);
  const storeId = enabled && store.data ? store.data.id : null;
  const online = useOnline();
  const client = useQueryClient();

  // Tempo real por ticket (DEC-045). Evento = "refaça a leitura": o REST continua sendo a verdade.
  const { connected: realtimeConnected } = useRealtimeChannel({
    area: 'lojista',
    target: { scope: 'store', storeId: storeId ?? 'none' },
    enabled: storeId !== null,
    onEvent: (event) => {
      if (!storeId) return;
      if (event.type.startsWith('exchange.')) void client.invalidateQueries({ queryKey: exchangesKeys.all(storeId) });
      else void client.invalidateQueries({ queryKey: ordersKeys.all(storeId) });
    },
  });

  const newQuery = useQuery({
    queryKey: ordersKeys.live(storeId ?? 'none', 'new'),
    queryFn: () => ordersApi.list(storeId as string, { scope: 'new', limit: 50 }),
    enabled,
    staleTime: 0,
    refetchInterval: realtimeConnected ? POLL_NEW_CONNECTED_MS : POLL_NEW_MS,
    // O lojista deixa o painel numa aba em segundo plano: o alerta não pode parar.
    refetchIntervalInBackground: true,
    refetchOnReconnect: 'always',
  });
  const progressQuery = useQuery({
    queryKey: ordersKeys.live(storeId ?? 'none', 'in_progress'),
    queryFn: () => ordersApi.list(storeId as string, { scope: 'in_progress', limit: 50 }),
    enabled,
    staleTime: 0,
    refetchInterval: realtimeConnected ? POLL_PROGRESS_CONNECTED_MS : POLL_PROGRESS_MS,
    refetchIntervalInBackground: true,
    refetchOnReconnect: 'always',
  });

  const pending = useMemo(() => (newQuery.data?.data ?? []).filter((order) => order.status === 'received').sort(byArrival), [newQuery.data]);
  const inProgress = useMemo(() => [...(progressQuery.data?.data ?? [])].sort(byArrival), [progressQuery.data]);

  // ---- som
  const [sound] = useState(createSound);
  const soundOn = useSyncExternalStore(sound.subscribe, sound.isEnabled, () => false);
  const soundSupported = sound.supported;

  const enableSound = useCallback(() => sound.enable(), [sound]);
  const testSound = useCallback(() => sound.play('normal'), [sound]);

  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const ring = useCallback(() => {
    const list = pendingRef.current;
    const oldest = list[0];
    if (!oldest) return;
    const strong = Date.now() - Date.parse(arrivedAt(oldest)) >= STRONG_AFTER_MS;
    sound.play(strong ? 'strong' : 'normal');
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(strong ? [400, 150, 400, 150, 400] : [250, 120, 250]);
  }, [sound]);

  // Pedido que acabou de chegar: toca na hora, sem esperar os 15 s.
  const announced = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    const fresh = pending.filter((order) => !announced.current.has(order.id));
    if (fresh.length === 0) return;
    fresh.forEach((order) => announced.current.add(order.id));
    ring();
  }, [enabled, pending, ring]);

  // Som ligado com pedido esperando: toca agora (o lojista acabou de tocar em "Ligar som").
  useEffect(() => {
    if (soundOn && pendingRef.current.length > 0) ring();
  }, [soundOn, ring]);

  // Repete a cada 15 s enquanto houver pedido sem resposta.
  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!enabled || !hasPending) return;
    const timer = setInterval(ring, ALERT_REPEAT_MS);
    return () => clearInterval(timer);
  }, [enabled, hasPending, ring]);

  // ---- título da aba piscando: "(2) Pedido novo"
  const pendingCount = pending.length;
  useEffect(() => {
    if (!enabled || pendingCount === 0) return;
    const original = document.title;
    const alertTitle = `(${pendingCount}) Pedido novo`;
    let showAlert = true;
    document.title = alertTitle;
    const timer = setInterval(() => {
      showAlert = !showAlert;
      document.title = showAlert ? alertTitle : original;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [enabled, pendingCount]);

  // ---- tela acesa (Wake Lock): sem suporte, o painel mostra a dica "Deixe a tela ligada".
  const [wakeLockHeld, setWakeLock] = useState<'active' | 'off'>('off');
  const wakeLockUnsupported = useSyncExternalStore(
    () => () => undefined,
    () => !('wakeLock' in navigator),
    () => false,
  );
  const wakeLock: WakeLockState = enabled && wakeLockUnsupported ? 'unsupported' : wakeLockHeld;
  useEffect(() => {
    if (!enabled || wakeLockUnsupported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setWakeLock('active');
        sentinel.addEventListener('release', () => setWakeLock('off'));
      } catch {
        setWakeLock('off');
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [enabled, wakeLockUnsupported]);

  const refetchNew = newQuery.refetch;
  const refetchProgress = progressQuery.refetch;
  const refresh = useCallback(async () => {
    await Promise.all([refetchNew(), refetchProgress()]);
  }, [refetchNew, refetchProgress]);

  const value = useMemo<OrdersRuntime>(
    () => ({
      enabled,
      storeId,
      pending,
      inProgress,
      newQuery,
      progressQuery,
      realtimeConnected,
      syncedAt: newQuery.dataUpdatedAt,
      connectionLost: enabled && (!online || newQuery.isError || progressQuery.isError),
      sound: { supported: soundSupported, enabled: soundOn, enable: enableSound, test: testSound },
      wakeLock,
      refresh,
    }),
    [enabled, storeId, pending, inProgress, newQuery, progressQuery, realtimeConnected, online, soundSupported, soundOn, enableSound, testSound, wakeLock, refresh],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
