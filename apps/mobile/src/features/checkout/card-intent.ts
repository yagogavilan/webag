import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchOrders } from '../../api/orders-api';

/**
 * Cartão pela página segura (B.2): depois de abrir o navegador, o app só ACOMPANHA o servidor. Nunca marca pago localmente: o pedido
 * aparece na lista quando o servidor o cria (a página segura consome a intenção e cria o pedido da conta dona).
 * A intenção fica só em memória (uso único, 15 min): nada disso vai para o disco.
 */
export interface PendingCardIntent {
  url: string;
  expiresAt: number;
  startedAt: number;
}

let pending: PendingCardIntent | null = null;
export const cardIntentMemory = {
  set(value: PendingCardIntent | null): void {
    pending = value;
  },
  get: (): PendingCardIntent | null => pending,
};

/** Pedido criado pela página segura depois de `since` (com folga de relógio de 2 min entre aparelho e servidor). */
export async function findOrderCreatedSince(since: number): Promise<string | null> {
  const page = await fetchOrders('active');
  const hit = page.data.find((o) => new Date(o.createdAt).getTime() >= since - 120_000);
  return hit?.id ?? null;
}

/** Confere o servidor a cada 4 s e quando o app volta ao primeiro plano (o cliente volta do navegador). */
export function useCardIntentWatcher(intent: PendingCardIntent | null, onFound: (orderId: string) => void): { expired: boolean } {
  const [expired, setExpired] = useState(false);
  const found = useRef(false);
  const cb = useRef(onFound);
  useEffect(() => {
    cb.current = onFound;
  });
  useEffect(() => {
    if (!intent) return;
    let alive = true;
    const check = async () => {
      if (found.current || !alive) return;
      if (Date.now() > intent.expiresAt + 60_000) {
        setExpired(true);
        return;
      }
      try {
        const id = await findOrderCreatedSince(intent.startedAt);
        if (id && !found.current) {
          found.current = true;
          cb.current(id);
        }
      } catch {
        // rede ruim: tenta de novo no próximo ciclo
      }
    };
    void check();
    const timer = setInterval(() => void check(), 4_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [intent]);
  return { expired };
}
