/** Erro no formato RFC 9457 devolvido pela API (`application/problem+json`). `code` é estável; a tela decide pela chave. */
export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly fields: FieldError[];
  readonly retryAfterSeconds: number | null;

  constructor(init: { status: number; code: string; title: string; detail?: string; fields?: FieldError[]; retryAfterSeconds?: number | null }) {
    super(init.detail ?? init.title);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.fields = init.fields ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }

  fieldMessage(field: string): string | undefined {
    return this.fields.find((f) => f.field === field || f.field.endsWith(`.${field}`))?.message;
  }
}

export function networkError(): ApiError {
  return new ApiError({ status: 0, code: 'NETWORK', title: 'Sem conexão', detail: 'Conecte-se para continuar.' });
}

interface ProblemBody {
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  errors?: FieldError[];
}

export async function toApiError(response: Response): Promise<ApiError> {
  let body: ProblemBody = {};
  try {
    body = (await response.json()) as ProblemBody;
  } catch {
    /* corpo vazio ou não JSON */
  }
  const retry = Number(response.headers.get('retry-after'));
  return new ApiError({
    status: response.status,
    code: body.code ?? `HTTP_${response.status}`,
    title: body.title ?? 'Erro',
    detail: body.detail,
    fields: Array.isArray(body.errors) ? body.errors : [],
    retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null,
  });
}

/** Falha do servidor ao gravar (inclui a auditoria, que falha fechada: WB-123 C4). */
export function isServerFailure(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 500;
}
