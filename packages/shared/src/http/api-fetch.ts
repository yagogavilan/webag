/**
 * Fetcher usado por todo o cliente gerado pelo Orval (ver orval.config.ts).
 * Cada app chama `configureApiClient` uma vez no boot com a URL da API do seu ambiente.
 * Autenticação, retry e Idempotency-Key entram aqui quando os módulos existirem (ADR-003).
 */
export interface ApiClientConfig {
  baseUrl: string;
  /** Cabeçalhos extras por requisição (ex.: Authorization). */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

let config: ApiClientConfig = { baseUrl: '' };

export function configureApiClient(next: ApiClientConfig): void {
  config = { ...next, baseUrl: next.baseUrl.replace(/\/+$/, '') };
}

const NO_BODY_STATUS = new Set([204, 205, 304]);

/** Mesmo formato de retorno do client `fetch` padrão do Orval: `{ data, status, headers }`. */
export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const extraHeaders = config.headers ? await config.headers() : {};
  const headers = new Headers(options.headers);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);

  const response = await fetch(`${config.baseUrl}${url}`, { ...options, headers });
  const text = NO_BODY_STATUS.has(response.status) ? '' : await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;

  return { data, status: response.status, headers: response.headers } as T;
}
