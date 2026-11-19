import { ApiError, networkError, toApiError } from './errors';

export type Area = 'admin' | 'lojista';

type Listener = (reason: 'expired' | 'idle') => void;
const listeners = new Set<Listener>();

/** A tela de sessão expirada se inscreve aqui: qualquer 401 depois da tentativa de renovação do BFF dispara. */
export function onSessionLost(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
  /** Corpo em texto puro: a planilha de produtos (`text/csv`). Exclusivo com `body`. */
  csv?: string;
  /** `Idempotency-Key` de uma escrita que o aparelho pode repetir (criar produto). */
  idempotencyKey?: string;
}

function queryString(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * Chamada ao BFF (`/api/proxy/<area>/...`), que anexa o token do cookie HttpOnly. O navegador nunca vê tokens.
 * Contrato provisório: os tipos vêm de `./admin` até o OpenAPI publicar estes endpoints (DT-014).
 */
export async function apiRequest<T>(area: Area, path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/proxy/${area}/${path}${queryString(options.query)}`, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        'x-webag-client': 'web',
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.csv !== undefined ? { 'content-type': 'text/csv; charset=utf-8' } : {}),
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      },
      body: options.csv !== undefined ? options.csv : options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw networkError();
  }
  if (!response.ok) {
    const error = await toApiError(response);
    if (response.status === 401) {
      const reason = error.code === 'SESSION_IDLE' ? 'idle' : 'expired';
      listeners.forEach((listener) => listener(reason));
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Baixa um arquivo (CSV) pelo BFF. Erros viram `ApiError` (ex.: `EXPORT_TOO_LARGE`). */
export async function apiDownload(area: Area, path: string, query?: RequestOptions['query']): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(`/api/proxy/${area}/${path}${queryString(query)}`, { headers: { accept: 'text/csv', 'x-webag-client': 'web' }, credentials: 'same-origin' });
  } catch {
    throw networkError();
  }
  if (!response.ok) {
    const error = await toApiError(response);
    if (response.status === 401) listeners.forEach((listener) => listener(error.code === 'SESSION_IDLE' ? 'idle' : 'expired'));
    throw error;
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? path.split('/').pop() ?? 'arquivo.csv';
  return { blob: await response.blob(), fileName };
}

/** Entrega o arquivo ao navegador (o CSV já vem do servidor com as fórmulas neutralizadas). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Chamada às rotas de sessão do BFF (login, logout, convite, cadastro do lojista). Não dispara "sessão perdida". */
export async function sessionRequest<T>(area: Area, action: 'login' | 'mfa' | 'logout' | 'accept-invite' | 'register', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/session/${area}/${action}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'x-webag-client': 'web', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw networkError();
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export { ApiError };
