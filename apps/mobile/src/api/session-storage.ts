import { randomUUID } from 'expo-crypto';
import * as SecureStore from '../lib/secure-store';

/**
 * Sessão SOMENTE em expo-secure-store (Keychain no iOS, Keystore no Android). SEC-012 / MASVS-STORAGE:
 * nada de token, código ou CPF em AsyncStorage, MMKV, log ou Sentry.
 */
const SESSION_KEY = 'webag.session.v1';
const DEVICE_KEY = 'webag.device-id.v1';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** epoch ms em que o access token vence. */
  accessExpiresAt: number;
  user: StoredUser;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const u = v.user as Record<string, unknown> | undefined;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.accessExpiresAt === 'number' &&
    typeof u === 'object' &&
    u !== null &&
    typeof u.id === 'string' &&
    typeof u.email === 'string'
  );
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    // keystore corrompido ou restaurado de outro aparelho: trata como deslogado
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // nada a apagar
  }
}

/** Identificador aleatório do aparelho (não é o IMEI nem o ID de publicidade): serve aos limites por dispositivo da API. */
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_KEY);
    if (existing) return existing;
  } catch {
    // segue e gera um novo
  }
  const id = randomUUID();
  try {
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  } catch {
    // sem persistência: o id vale só nesta execução
  }
  return id;
}
