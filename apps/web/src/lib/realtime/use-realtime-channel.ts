'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiRequest, type Area } from '@/lib/api/client';

/** Aviso do canal `/rt` (ADR-004). É só aviso: a fonte da verdade é sempre a leitura REST. */
export interface RealtimeEvent {
  type: string;
  orderId?: string;
  exchangeId?: string;
  storeId?: string;
}

export type RealtimeScope = { scope: 'store'; storeId: string } | { scope: 'admin' } | { scope: 'user' };

interface TicketResponse {
  ticket: string;
  expiresInSeconds: number;
  /** Origem onde o navegador abre o canal (o BFF a acrescenta; a API não é alcançável por ele). */
  url: string;
}

const RETRY_MS = [5_000, 15_000, 30_000, 60_000];

/**
 * Tempo real dos painéis por ticket de uso único (DEC-045, ADR-003): o BFF emite o ticket com o cookie HttpOnly, o navegador abre
 * `/rt` com `auth: { ticket }` e o JWT nunca chega ao JavaScript. O ticket vale uma conexão: a cada reconexão (inclusive depois de
 * `auth.expired`) um novo é pedido. Devolve `connected`; quem usa o canal lê o REST devagar quando conectado e depressa quando não
 * (fallback de polling), e trata o evento como "refaça a leitura".
 */
export function useRealtimeChannel({ area, target, enabled = true, onEvent }: { area: Area; target: RealtimeScope; enabled?: boolean; onEvent: (event: RealtimeEvent) => void }): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const scope = target.scope;
  const storeId = target.scope === 'store' ? target.storeId : undefined;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let socket: Socket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let first: string | null = null;

    const requestTicket = () => apiRequest<TicketResponse>(area, 'realtime/tickets', { method: 'POST', body: scope === 'store' ? { scope, storeId } : { scope } });

    const open = (url: string) => {
      socket = io(`${url}/rt`, {
        transports: ['websocket'],
        reconnectionDelay: 2_000,
        reconnectionDelayMax: 30_000,
        // Um ticket por tentativa: o primeiro já foi pedido; os seguintes saem daqui.
        auth: (cb) => {
          if (first) {
            const ticket = first;
            first = null;
            cb({ ticket });
            return;
          }
          requestTicket().then(
            (t) => cb({ ticket: t.ticket }),
            () => cb({ ticket: '' }),
          );
        },
      });
      socket.on('connect', () => {
        failures = 0;
        setConnected(true);
      });
      socket.on('connect_error', () => setConnected(false));
      socket.on('disconnect', (reason) => {
        setConnected(false);
        // `auth.expired` e queda pedida pelo servidor: o cliente não reconecta sozinho; um novo ticket reabre.
        if (reason === 'io server disconnect' && !disposed) setTimeout(() => !disposed && socket?.connect(), 500);
      });
      socket.onAny((name: string, payload: unknown) => {
        if (name === 'auth.expired') return;
        const body = typeof payload === 'object' && payload !== null ? (payload as Omit<RealtimeEvent, 'type'> & { type?: string }) : {};
        handler.current({ ...body, type: body.type ?? name });
      });
    };

    const start = () => {
      requestTicket().then(
        (t) => {
          if (disposed) return;
          first = t.ticket;
          open(t.url);
        },
        () => {
          // Sem ticket (sem permissão, API fora, canal não configurado): fica no polling e tenta de novo com recuo.
          if (disposed) return;
          const delay = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]!;
          failures += 1;
          retryTimer = setTimeout(start, delay);
        },
      );
    };
    start();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      setConnected(false);
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [area, scope, storeId, enabled]);

  return { connected };
}
