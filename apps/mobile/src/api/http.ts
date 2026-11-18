import { REFRESH_SKEW_MS, REQUEST_TIMEOUT_MS } from './config';
import { ApiError, toApiError } from './problem';
import { getDeviceId } from './session-storage';
import { sessionStore } from './session';
import { refreshSession } from '@webag/shared';

/** Forma comum das respostas geradas pelo Orval: `{ data, status, headers }`. */
interface ApiResponse {
  status: number;
  data: unknown;
  headers: Headers;
}

type Success<R> = R extends { status: 200 | 201 | 202 | 204; data: infer D } ? D : never;

export interface RequestOptions {
  /** `required` (padrão para rotas autenticadas): anexa o Bearer e renova no 401. `none`: rota pública. */
  auth?: 'required' | 'none';
  /** Repete falha de rede/5xx com backoff. Só para leituras e escritas com Idempotency-Key. */
  retry?: boolean;
  /** Escritas repetíveis (pedido, pagamento): o mesmo valor em toda repetição. */
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const MAX_RETRIES = 2;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => 400 * 2 ** attempt + Math.floor(Math.random() * 200);

let refreshing: Promise<boolean> | null = null;

/**
 * Renovação com refresh rotativo, uma por vez (single-flight). A API aceita repetir o mesmo refresh por 30 s
 * (retry de rede), mas reuso fora da janela derruba a sessão: por isso nunca disparamos duas renovações juntas.
 * Devolve false se a sessão foi encerrada; lança ApiError de rede se não deu para saber.
 */
export function renewTokens(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const stored = sessionStore.getTokens();
  if (!stored) return false;
  let response: Awaited<ReturnType<typeof refreshSession>>;
  try {
    response = await refreshSession({ refreshToken: stored.refreshToken }, { headers: await baseHeaders(), signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw networkError(error);
  }
  if (response.status === 200) {
    const pair = response.data;
    await sessionStore.rotateTokens({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      accessExpiresAt: Date.now() + pair.expiresIn * 1000,
    });
    return true;
  }
  if (response.status === 401) {
    const reused = (response.data as { code?: string } | undefined)?.code === 'REFRESH_REUSED';
    await sessionStore.clear(reused ? 'reused' : 'expired');
    return false;
  }
  // 429/5xx: não derruba a sessão por falha do servidor; a tela mostra "tente de novo"
  throw toApiError(response.status, response.data, response.headers);
}

async function baseHeaders(): Promise<Record<string, string>> {
  return { 'X-Device-Id': await getDeviceId() };
}

function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const stop = () => clearTimeout(timer);
  controller.signal.addEventListener('abort', stop, { once: true });
  outer?.addEventListener('abort', () => controller.abort(), { once: true });
  return controller.signal;
}

function networkError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const aborted = error instanceof Error && error.name === 'AbortError';
  // JSON inválido (página de erro de proxy) também cai aqui: para o usuário é indisponibilidade
  if (error instanceof SyntaxError) return new ApiError({ kind: 'server', status: 502, code: 'BAD_GATEWAY' });
  return new ApiError({ kind: aborted ? 'timeout' : 'network', code: aborted ? 'TIMEOUT' : 'NETWORK' });
}

/**
 * Ponto único de saída HTTP do app. Recebe uma função do cliente gerado (packages/shared) e devolve só o corpo de sucesso;
 * qualquer não-2xx vira `ApiError` com `code` estável.
 *
 *   const result = await request((init) => login(body, init), { auth: 'none' });
 */
export async function request<R extends ApiResponse>(
  call: (init: RequestInit) => Promise<R>,
  options: RequestOptions = {},
): Promise<Success<R>> {
  const { auth = 'required', retry = false, idempotencyKey, timeoutMs = REQUEST_TIMEOUT_MS, signal } = options;
  const canRetry = retry || idempotencyKey !== undefined;
  let renewedOnce = false;

  for (let attempt = 0; ; attempt++) {
    try {
      if (auth === 'required') {
        const stored = sessionStore.getTokens();
        if (stored && stored.accessExpiresAt - Date.now() < REFRESH_SKEW_MS) await renewTokens();
      }
      const headers: Record<string, string> = await baseHeaders();
      const access = sessionStore.getTokens()?.accessToken;
      if (auth === 'required' && access) headers.Authorization = `Bearer ${access}`;
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

      const response = await call({ headers, signal: timeoutSignal(timeoutMs, signal) });

      if (response.status === 401 && auth === 'required' && !renewedOnce && sessionStore.getTokens()) {
        renewedOnce = true;
        if (await renewTokens()) continue;
      }
      if (response.status >= 200 && response.status < 300) return response.data as Success<R>;

      const error = toApiError(response.status, response.data, response.headers);
      if (error.kind === 'server' && canRetry && attempt < MAX_RETRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      throw error;
    } catch (caught) {
      if (caught instanceof ApiError && (!caught.isConnectivity || !canRetry || attempt >= MAX_RETRIES)) throw caught;
      const error = networkError(caught);
      if (!canRetry || attempt >= MAX_RETRIES || signal?.aborted) throw error;
      await sleep(backoff(attempt));
    }
  }
}
