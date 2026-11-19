import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../../api/config';
import { renewTokens } from '../../api/http';
import { sessionStore, useSession } from '../../api/session';
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

/**
 * Canal em tempo real com fallback de polling: devolve `connected`. Conectado, a tela lê o REST devagar (30 s); caído, de 5 em 5 s.
 * Token no handshake (`auth`), renovado a cada reconexão; `auth.expired` renova e reconecta. Nada sensível trafega pelo socket.
 */
export function useRealtime({ orderId, onEvent, enabled = true }: RealtimeOptions): { connected: boolean } {
  const session = useSession();
  const authed = session.status === 'authenticated';
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled || !authed) return;
    let socket: Socket | null = null;
    let disposed = false;
    const subscribe = () => {
      if (orderId) socket?.emit('subscribe', { orderId });
    };
    const start = async () => {
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
      if (disposed) return;
      socket = io(`${API_URL}/rt`, {
        transports: ['websocket'],
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 15_000,
        auth: (cb) => cb({ token: sessionStore.getTokens()?.accessToken ?? '' }),
      });
      socket.on('connect', () => {
        setConnected(true);
        subscribe();
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => setConnected(false));
      socket.on('auth.expired', () => {
        void renewTokens()
          .then((ok) => ok && !disposed && socket?.connect())
          .catch(() => undefined);
      });
      for (const name of EVENTS) {
        socket.on(name, (payload: RealtimeEvent) => {
          if (orderId && payload.orderId && payload.orderId !== orderId) return;
          void haptic('light');
          handler.current(payload);
        });
      }
    };
    void start();
    return () => {
      disposed = true;
      setConnected(false);
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [authed, enabled, orderId]);

  return { connected };
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
