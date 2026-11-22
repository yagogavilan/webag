'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { viewAsApi, viewAsKeys, type ViewAsState } from '@/lib/api/view-as';
import { useNow } from '@/lib/use-now';
import { FIVE_MIN_MS, ONE_MIN_MS, WARNING_TEXT } from './clock';

/** Estado da visão (id, loja e fim), lido do BFF: a credencial não vem. Reconsulta ao focar a aba e a cada 20 s (visão aberta em outra aba). */
export function useViewAsState() {
  return useQuery<ViewAsState>({ queryKey: viewAsKeys.state, queryFn: viewAsApi.state, staleTime: 0, refetchInterval: 20_000, refetchOnWindowFocus: true, retry: 1 });
}

/** Milissegundos que faltam; tica a cada segundo. Só o texto que muda (por minuto, e por segundo no último minuto) atualiza o DOM. */
export function useRemaining(expiresAt: string | undefined): number {
  const target = expiresAt ? Date.parse(expiresAt) : NaN;
  const now = useNow(1000);
  return Number.isFinite(target) ? Math.max(target - now, 0) : 0;
}

/** Aviso único aos 5 min e a 1 min (região `aria-live=polite` separada do relógio). */
export function useWarnings(remainingMs: number, active: boolean): string {
  const [message, setMessage] = useState('');
  const said = useRef({ five: false, one: false });
  useEffect(() => {
    if (!active || remainingMs <= 0) return;
    if (remainingMs <= ONE_MIN_MS) {
      if (!said.current.one) {
        said.current = { five: true, one: true };
        setMessage(WARNING_TEXT['last-minute']);
      }
    } else if (remainingMs <= FIVE_MIN_MS && !said.current.five) {
      said.current.five = true;
      setMessage(WARNING_TEXT.attention);
    }
  }, [remainingMs, active]);
  return message;
}

const LAST_REASON_KEY = 'wb:view-as:last-reason';
export interface LastReason {
  code: string;
  note?: string;
}

/** Motivo da visão anterior (só nesta aba): reabrir não obriga a escolher de novo no meio de uma ligação. Nunca guarda a credencial. */
export function readLastReason(): LastReason | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_REASON_KEY);
    return raw ? (JSON.parse(raw) as LastReason) : null;
  } catch {
    return null;
  }
}
export function saveLastReason(reason: LastReason): void {
  try {
    window.sessionStorage.setItem(LAST_REASON_KEY, JSON.stringify(reason));
  } catch {
    /* sem armazenamento: o motivo só não vem preenchido */
  }
}
