/** Erro de API normalizado (RFC 9457 + falhas de rede). O app decide mensagem e ação pelo `code`, nunca pelo texto. */
export type ApiErrorKind = 'network' | 'timeout' | 'server' | 'problem';

export interface FieldProblem {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly detail: string | undefined;
  readonly fields: FieldProblem[];
  /** Segundos de espera (429, cabeçalho Retry-After). */
  readonly retryAfter: number | undefined;

  constructor(init: {
    kind: ApiErrorKind;
    status?: number;
    code?: string;
    detail?: string | undefined;
    fields?: FieldProblem[];
    retryAfter?: number | undefined;
  }) {
    super(init.code ?? init.kind);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? 0;
    this.code = init.code ?? init.kind.toUpperCase();
    this.detail = init.detail;
    this.fields = init.fields ?? [];
    this.retryAfter = init.retryAfter;
  }

  /** Falha de conexão (sem resposta útil do servidor): a tela mostra "tente de novo" e preserva o formulário. */
  get isConnectivity(): boolean {
    return this.kind === 'network' || this.kind === 'timeout';
  }
}

interface ProblemBody {
  code?: unknown;
  detail?: unknown;
  errors?: unknown;
}

export function toApiError(status: number, data: unknown, headers?: Headers): ApiError {
  const body = (typeof data === 'object' && data !== null ? data : {}) as ProblemBody;
  const fields: FieldProblem[] = Array.isArray(body.errors)
    ? body.errors
        .filter((e): e is { field: string; message: string } => typeof e?.field === 'string' && typeof e?.message === 'string')
        .map((e) => ({ field: e.field, message: e.message }))
    : [];
  const retryHeader = Number(headers?.get('retry-after'));
  return new ApiError({
    kind: status >= 500 ? 'server' : 'problem',
    status,
    code: typeof body.code === 'string' ? body.code : `HTTP_${status}`,
    detail: typeof body.detail === 'string' ? body.detail : undefined,
    fields,
    retryAfter: Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined,
  });
}
