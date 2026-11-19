import { HttpException } from '@nestjs/common';
/**
 * Erro de negócio com `code` estável (RFC 9457 + skill contrato-api): o app decide a ação pelo `code`;
 * `title`/`detail` são pt-BR e podem ir à tela.
 */
export class AppError extends HttpException {
    code;
    title;
    problem;
    constructor(status, code, title, problem = {}) {
        super(title, status);
        this.code = code;
        this.title = title;
        this.problem = problem;
    }
}
export const errors = {
    validation: (fields) => new AppError(400, 'VALIDATION_FAILED', 'Dados inválidos', { errors: fields }),
    unauthenticated: (detail = 'Faça login para continuar.') => new AppError(401, 'UNAUTHENTICATED', 'Não autenticado', { detail }),
    forbidden: (code = 'FORBIDDEN', detail = 'Você não tem permissão para esta ação.') => new AppError(403, code, 'Sem permissão', { detail }),
    notFound: (detail = 'Recurso não encontrado.') => new AppError(404, 'NOT_FOUND', 'Não encontrado', { detail }),
    conflict: (code, title, detail, extensions) => new AppError(409, code, title, { detail, ...(extensions ? { extensions } : {}) }),
    gone: (code, title, detail) => new AppError(410, code, title, { detail }),
    unprocessable: (code, title, options) => new AppError(422, code, title, options),
    tooMany: (retryAfterSeconds, detail = 'Muitas tentativas. Tente novamente em instantes.') => new AppError(429, 'RATE_LIMITED', 'Muitas tentativas', { detail, retryAfterSeconds }),
};
//# sourceMappingURL=app-error.js.map