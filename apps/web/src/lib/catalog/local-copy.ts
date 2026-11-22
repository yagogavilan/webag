/**
 * Cópia local do que o lojista digitou (RN-Q2, C-CAD-08, WB-371 C7/C8, DEC-126). NÃO é fila: nada daqui é enviado sozinho. Serve só
 * para o formulário sobreviver à recarga da aba (voltar da câmera no Android de entrada) e à queda de sinal.
 *
 * Regras: só com sessão; chave por usuário e loja; só texto do formulário e ids de fotos já enviadas (sem dado pessoal, sem token,
 * sem e-mail); vence em 30 dias (texto colado, 24 h); apagada ao sair. `localStorage` versionado (e não IndexedDB): o conteúdo
 * tem poucos KB, a leitura precisa ser síncrona para o formulário não piscar vazio depois da câmera, e não há dependência nova.
 */
const PREFIX = 'webag:lojista:v1';
export const LOCAL_COPY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PASTE_COPY_TTL_MS = 24 * 60 * 60 * 1000;

export interface QuickCopy {
  name: string;
  priceCents: number | null;
  stockText: string;
  categoryId: string;
  description: string;
  /** Fotos já enviadas ao armazenamento (só ids; a prévia vem do servidor). */
  imageIds: string[];
  /** `true` enquanto o servidor ainda não confirmou estes valores. */
  unsent: boolean;
}

interface Stored<T> {
  v: 1;
  savedAt: number;
  data: T;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const quickKey = (userId: string, storeId: string, draftId: string) => `${PREFIX}:${userId}:${storeId}:quick:${draftId}`;
const pasteKey = (userId: string, storeId: string) => `${PREFIX}:${userId}:${storeId}:paste`;

function read<T>(key: string, ttl: number, now: number): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored<T>>;
    if (parsed.v !== 1 || typeof parsed.savedAt !== 'number' || parsed.data === undefined || now - parsed.savedAt > ttl) {
      store.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    store.removeItem(key);
    return null;
  }
}

function write<T>(key: string, data: T, now: number): void {
  try {
    storage()?.setItem(key, JSON.stringify({ v: 1, savedAt: now, data } satisfies Stored<T>));
  } catch {
    /* armazenamento cheio ou bloqueado: a cópia local é só conforto */
  }
}

export const readQuickCopy = (userId: string, storeId: string, draftId: string, now = Date.now()): QuickCopy | null => read<QuickCopy>(quickKey(userId, storeId, draftId), LOCAL_COPY_TTL_MS, now);
export const writeQuickCopy = (userId: string, storeId: string, draftId: string, copy: QuickCopy, now = Date.now()): void => write(quickKey(userId, storeId, draftId), copy, now);
export const removeQuickCopy = (userId: string, storeId: string, draftId: string): void => {
  storage()?.removeItem(quickKey(userId, storeId, draftId));
};

export const readPasteCopy = (userId: string, storeId: string, now = Date.now()): string | null => read<{ text: string }>(pasteKey(userId, storeId), PASTE_COPY_TTL_MS, now)?.text ?? null;
export const writePasteCopy = (userId: string, storeId: string, text: string, now = Date.now()): void => {
  if (text.trim() === '') storage()?.removeItem(pasteKey(userId, storeId));
  else write(pasteKey(userId, storeId), { text }, now);
};
export const removePasteCopy = (userId: string, storeId: string): void => {
  storage()?.removeItem(pasteKey(userId, storeId));
};

function ownKeys(userId: string | null): string[] {
  const store = storage();
  if (!store) return [];
  const prefix = userId === null ? `${PREFIX}:` : `${PREFIX}:${userId}:`;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

/** Há texto ou formulário ainda não enviado? O app avisa antes de sair (RN-Q2). */
export function hasUnsentCopies(userId: string, now = Date.now()): boolean {
  const store = storage();
  if (!store) return false;
  return ownKeys(userId).some((key) => {
    if (key.endsWith(':paste')) return read<{ text: string }>(key, PASTE_COPY_TTL_MS, now) !== null;
    return read<QuickCopy>(key, LOCAL_COPY_TTL_MS, now)?.unsent === true;
  });
}

/** Ao sair: nada do lojista fica no aparelho (o próximo usuário do mesmo navegador não vê rascunho, WB-371 C7). */
export function purgeLocalCopies(userId: string | null = null): void {
  const store = storage();
  if (!store) return;
  for (const key of ownKeys(userId)) store.removeItem(key);
}
