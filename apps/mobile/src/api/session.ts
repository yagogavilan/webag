import { useSyncExternalStore } from 'react';
import { clearSession, loadSession, saveSession, type StoredSession, type StoredUser } from './session-storage';

/**
 * Estado de sessão do app. Os tokens ficam em memória (módulo) e no SecureStore; a UI só enxerga o resumo do usuário.
 * Estado externo mínimo (sem Zustand): é só um valor que muda raramente.
 */
export type SessionNotice = 'expired' | 'reused';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; notice?: SessionNotice }
  | { status: 'authenticated'; user: StoredUser };

type Cleanup = () => Promise<void> | void;

let current: SessionState = { status: 'loading' };
const cleanups = new Set<Cleanup>();
let tokens: StoredSession | null = null;
const listeners = new Set<() => void>();

function emit(next: SessionState): void {
  current = next;
  listeners.forEach((l) => l());
}

/**
 * Registra uma limpeza de dado pessoal que deve rodar em TODO encerramento de sessão (sair, expirar, reuso do refresh): SEC-122.
 * Quem guarda dado do usuário no aparelho (endereços, histórico, cache de favoritos) se registra aqui; session.ts não importa nenhum deles.
 */
export function onSessionCleared(cleanup: Cleanup): () => void {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}

export const sessionStore = {
  getState: (): SessionState => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getTokens: (): StoredSession | null => tokens,

  /** Lê o SecureStore no boot. Não chama a rede: o access vencido é renovado na primeira requisição. */
  async bootstrap(): Promise<void> {
    const stored = await loadSession();
    tokens = stored;
    emit(stored ? { status: 'authenticated', user: stored.user } : { status: 'anonymous' });
  },

  async setSession(session: StoredSession): Promise<void> {
    tokens = session;
    await saveSession(session);
    emit({ status: 'authenticated', user: session.user });
  },

  /** Troca só os tokens (renovação), mantendo o usuário. */
  async rotateTokens(next: Pick<StoredSession, 'accessToken' | 'refreshToken' | 'accessExpiresAt'>): Promise<void> {
    if (!tokens) return;
    tokens = { ...tokens, ...next };
    await saveSession(tokens);
  },

  async updateUser(patch: Partial<StoredUser>): Promise<void> {
    if (!tokens) return;
    tokens = { ...tokens, user: { ...tokens.user, ...patch } };
    await saveSession(tokens);
    emit({ status: 'authenticated', user: tokens.user });
  },

  /** Sair (ou sessão derrubada pelo servidor): apaga tudo do aparelho. */
  async clear(notice?: SessionNotice): Promise<void> {
    tokens = null;
    await clearSession();
    await Promise.allSettled([...cleanups].map((run) => Promise.resolve().then(run)));
    emit(notice ? { status: 'anonymous', notice } : { status: 'anonymous' });
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, sessionStore.getState);
}
