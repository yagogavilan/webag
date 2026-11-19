import { registerPushDevice, revokePushDevice } from '@webag/shared';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { request } from '../../api/http';
import { deleteSecure, readSecure, writeSecure } from '../../lib/secure-kv';

/**
 * Push transacional (pedido e troca), RF-NOT-01. O pedido de permissão só acontece depois do 1º pedido, com tela explicativa antes
 * (confirmed.push-enable). O push nunca leva dado pessoal nem código de retirada (contrato): o app abre o pedido e lê o REST.
 */
export type PushStatus = 'granted' | 'denied' | 'blocked' | 'undetermined';
const TOKEN_KEY = 'webag.push.token';

export async function getPushStatus(): Promise<PushStatus> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    if (p.canAskAgain === false) return 'blocked';
    return p.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** Mostra o aviso do sistema e, se aceito, registra o aparelho. Devolve o estado final; nunca lança. */
export async function enablePush(): Promise<PushStatus> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', { name: 'Pedidos', importance: Notifications.AndroidImportance.HIGH });
    }
    const asked = await Notifications.requestPermissionsAsync();
    if (!asked.granted) return asked.canAskAgain === false ? 'blocked' : 'denied';
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await request((init) => registerPushDevice({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' }, init), { retry: true });
    await writeSecure(TOKEN_KEY, token);
    return 'granted';
  } catch {
    // sem projectId (dev local) ou sem rede: o aviso vale só quando o registro der certo; o pedido segue sem push
    return 'denied';
  }
}

/** No logout: desliga o push deste aparelho para a conta que saiu. Falha em silêncio (sem rede: o servidor reatribui o token). */
export async function revokePush(): Promise<void> {
  try {
    const token = await readSecure(TOKEN_KEY);
    if (!token) return;
    await request((init) => revokePushDevice({ token }, init), { timeoutMs: 5_000 });
    await deleteSecure(TOKEN_KEY);
  } catch {
    // ignora
  }
}

export const openNotificationSettings = (): Promise<void> => Linking.openSettings();
