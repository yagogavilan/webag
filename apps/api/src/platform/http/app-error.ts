import { HttpException } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

export interface AppErrorOptions {
  detail?: string;
  errors?: FieldError[];
  /** Segundos até poder tentar de novo (vira o header Retry-After em 429/503). */
  retryAfterSeconds?: number;
  /** Membros de extensão do RFC 9457 (ex.: loja atual na sacola). Nunca dado pessoal ou interno. */
  extensions?: Record<string, unknown>;
}

/**
 * Erro de negócio com `code` estável (RFC 9457 + skill contrato-api): o app decide a ação pelo `code`;
 * `title`/`detail` são pt-BR e podem ir à tela.
 */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly title: string,
    readonly problem: AppErrorOptions = {},
  ) {
    super(title, status);
  }
}

export const errors = {
  validation: (fields: FieldError[]) =>
    new AppError(400, 'VALIDATION_FAILED', 'Dados inválidos', { errors: fields }),
  unauthenticated: (detail = 'Faça login para continuar.') =>
    new AppError(401, 'UNAUTHENTICATED', 'Não autenticado', { detail }),
  forbidden: (code = 'FORBIDDEN', detail = 'Você não tem permissão para esta ação.') =>
    new AppError(403, code, 'Sem permissão', { detail }),
  notFound: (detail = 'Recurso não encontrado.') =>
    new AppError(404, 'NOT_FOUND', 'Não encontrado', { detail }),
  conflict: (code: string, title: string, detail?: string, extensions?: Record<string, unknown>) =>
    new AppError(409, code, title, { detail, ...(extensions ? { extensions } : {}) }),
  gone: (code: string, title: string, detail?: string) => new AppError(410, code, title, { detail }),
  unprocessable: (code: string, title: string, options?: AppErrorOptions) =>
    new AppError(422, code, title, options),
  tooMany: (retryAfterSeconds: number, detail = 'Muitas tentativas. Tente novamente em instantes.') =>
    new AppError(429, 'RATE_LIMITED', 'Muitas tentativas', { detail, retryAfterSeconds }),
};
