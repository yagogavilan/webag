import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { API_URL } from '../../api/config';
import { renewTokens } from '../../api/http';
import { onSessionCleared, sessionStore, useSession } from '../../api/session';
import { haptic } from '../../lib/haptics';

/** Evento do canal `/rt` (ADR-004). É só aviso: o estado verdadeiro sempre vem do REST. */
export interface RealtimeEvent {
  type: string;
  orderId?: string;
  exchangeId?: string;
  status?: string;
}

export interface RealtimeOptions {
  /** Pedido acompanhado: o app pede `subscribe {orderId}` (o servidor só aceita pedido da própria conta). */
  orderId?: string | undefined;
  /** Chamado a cada evento relevante: a tela refaz a leitura REST. */
  onEvent: (event: RealtimeEvent) => void;
  enabled?: boolean;
}

const EVENTS = ['order.status_changed', 'exchange.status_changed'] as const;

interface Subscriber {
  orderId: string | undefined;
  onEvent: (event: RealtimeEvent) => void;
}

/**
 * UM socket por aparelho (I11), compartilhado por todas as telas montadas (pedido, lista, troca). Cada tela entra e sai como
 * assinante; o socket abre com o primeiro e fecha, com uma folga, quando o último sai. Três telas montadas = uma conexão, uma
 * renovação de token, uma bateria. A assinatura de sala (`subscribe {orderId}`) é por pedido, uma vez por pedido distinto.
 */
const subscribers = new Set<Subscriber>();
const stateListeners = new Set<(connected: boolean) => void>();
let socket: Socket | null = null;
let connected = false;
let starting = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const CLOSE_GRACE_MS = 3_000;

const subscribeState = (listener: () => void): (() => void) => {
  const wrapped = () => listener();
  stateListeners.add(wrapped);
  return () => {
    stateListeners.delete(wrapped);
  };
};

const setConnected = (value: boolean) => {
  if (connected === value) return;
  connected = value;
  stateListeners.forEach((listener) => listener(value));
};

const wantedOrders = (): Set<string> => new Set([...subscribers].map((s) => s.orderId).filter((id): id is string => Boolean(id)));

function subscribeRooms(): void {
  for (const orderId of wantedOrders()) socket?.emit('subscribe', { orderId });
}

function dispatch(payload: RealtimeEvent): void {
  let notified = false;
  for (const sub of subscribers) {
    // assinante de um pedido só recebe o próprio; assinante geral (lista, troca) recebe todos
    if (sub.orderId && payload.orderId && payload.orderId !== sub.orderId) continue;
    notified = true;
    sub.onEvent(payload);
  }
  if (notified) void haptic('light');
}

async function open(): Promise<void> {
  if (socket || starting) return;
  starting = true;
  try {
    // Access vencido: renova antes do handshake (senão o servidor recusa e o app cai no polling por nada).
    const tokens = sessionStore.getTokens();
    if (!tokens) return;
    if (tokens.accessExpiresAt - Date.now() < 30_000) {
      try {
        if (!(await renewTokens())) return;
      } catch {
        return;
      }
    }
    if (subscribers.size === 0) return;
    const next = io(`${API_URL}/rt`, {
      transports: ['websocket'],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      auth: (cb) => cb({ token: sessionStore.getTokens()?.accessToken ?? '' }),
    });
    socket = next;
    next.on('connect', () => {
      setConnected(true);
      subscribeRooms();
    });
    next.on('disconnect', () => setConnected(false));
    next.on('connect_error', () => setConnected(false));
    next.on('auth.expired', () => {
      void renewTokens()
        .then((ok) => ok && socket === next && next.connect())
        .catch(() => undefined);
    });
    for (const name of EVENTS) next.on(name, dispatch);
  } finally {
    starting = false;
  }
}

function close(): void {
  const current = socket;
  socket = null;
  setConnected(false);
  current?.removeAllListeners();
  current?.disconnect();
}

function join(sub: Subscriber): () => void {
  subscribers.add(sub);
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (socket?.connected && sub.orderId) socket.emit('subscribe', { orderId: sub.orderId });
  void open();
  return () => {
    subscribers.delete(sub);
    if (subscribers.size === 0) {
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (subscribers.size === 0) close();
      }, CLOSE_GRACE_MS);
    }
  };
}

// Sessão encerrada (sair, expirar, excluir conta): o socket cai na hora, sem esperar a folga
onSessionCleared(() => {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
  close();
});

/** Só para testes. */
export const realtimeDebug = { subscriberCount: () => subscribers.size, hasSocket: () => socket !== null, reset: () => { subscribers.clear(); if (closeTimer) clearTimeout(closeTimer); closeTimer = null; close(); } };

/**
 * Canal em tempo real com fallback de polling: devolve `connected`. Conectado, a tela lê o REST devagar (30 s); caído, de 5 em 5 s.
 * Token no handshake (`auth`), renovado a cada reconexão; `auth.expired` renova e reconecta. Nada sensível trafega pelo socket.
 */
export function useRealtime({ orderId, onEvent, enabled = true }: RealtimeOptions): { connected: boolean } {
  const session = useSession();
  const authed = session.status === 'authenticated';
  const isConnected = useSyncExternalStore(subscribeState, () => connected, () => false);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!enabled || !authed) return;
    return join({ orderId, onEvent: (event) => handler.current(event) });
  }, [authed, enabled, orderId]);

  return { connected: enabled && authed ? isConnected : false };
}

/** Intervalo de leitura do REST: devagar com o canal conectado, rápido sem ele (fallback), com recuo no PIX. */
export const pollingInterval = (connected: boolean, fastMs = 5_000, slowMs = 30_000): number => (connected ? slowMs : fastMs);

/** Atalho: ao receber evento, invalida as leituras do pedido (detalhe, pagamento e listas). */
export function useInvalidateOnEvent(orderId: string | undefined, enabled = true): { connected: boolean } {
  const client = useQueryClient();
  return useRealtime({
    orderId,
    enabled,
    onEvent: () => {
      void client.invalidateQueries({ queryKey: ['orders'] });
      void client.invalidateQueries({ queryKey: ['exchanges'] });
    },
  });
}
