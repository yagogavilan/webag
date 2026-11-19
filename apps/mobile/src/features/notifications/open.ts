import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { reportPushOpened } from '../../api/privacy-api';
import { useSession } from '../../api/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PushTarget {
  campaignId: string | null;
  /** Rota interna já validada (nunca uma URL vinda do push: SEC-126). */
  route: { pathname: '/order/[id]' | '/exchange/[id]'; params: { id: string } } | null;
}

/**
 * O push só carrega identificadores (nunca dado pessoal): o app valida o formato e abre uma tela NOSSA, que lê o REST.
 * Qualquer campo fora do esperado é ignorado; URL em `data` nunca é aberta.
 */
export function parsePushData(data: unknown): PushTarget {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const id = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null);
  const orderId = id(d.orderId);
  const exchangeId = id(d.exchangeId);
  return {
    campaignId: id(d.campaignId),
    route: orderId ? { pathname: '/order/[id]', params: { id: orderId } } : exchangeId ? { pathname: '/exchange/[id]', params: { id: exchangeId } } : null,
  };
}

/** Toque na notificação: conta a abertura da campanha (`POST /v1/me/push-campaigns/{id}/opened`) e abre a tela do pedido ou da troca. */
export function usePushOpenHandler(): void {
  const router = useRouter();
  const session = useSession();
  const authed = session.status === 'authenticated';
  useEffect(() => {
    if (!authed) return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const target = parsePushData(response.notification.request.content.data);
      if (target.campaignId) void reportPushOpened(target.campaignId);
      if (target.route) router.push(target.route as never);
    };
    // App fechado: a notificação que o abriu
    void Notifications.getLastNotificationResponseAsync?.().then(handle).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener?.(handle);
    return () => sub?.remove();
  }, [authed, router]);
}
