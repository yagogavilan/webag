var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Catch, HttpException, Logger } from '@nestjs/common';
import { captureError } from '../observability/sentry.js';
import { AppError } from './app-error.js';
const ERROR_BASE = 'https://api.webag.com.br/errors/';
const STATUS_DEFAULTS = {
    400: { code: 'BAD_REQUEST', title: 'Requisição inválida' },
    401: { code: 'UNAUTHENTICATED', title: 'Não autenticado' },
    403: { code: 'FORBIDDEN', title: 'Sem permissão' },
    404: { code: 'NOT_FOUND', title: 'Não encontrado' },
    405: { code: 'METHOD_NOT_ALLOWED', title: 'Método não permitido' },
    413: { code: 'PAYLOAD_TOO_LARGE', title: 'Corpo grande demais' },
    415: { code: 'UNSUPPORTED_MEDIA_TYPE', title: 'Tipo de conteúdo não suportado' },
    429: { code: 'RATE_LIMITED', title: 'Muitas tentativas' },
};
/** Todo erro sai como application/problem+json (RFC 9457), sem stack trace e sem vazar detalhe interno. */
let ProblemFilter = class ProblemFilter {
    logger = new Logger('Problem');
    catch(exception, host) {
        const http = host.switchToHttp();
        const res = http.getResponse();
        const req = http.getRequest();
        // /health segue o contrato próprio do Terminus (HealthStatus), não o RFC 9457.
        if (exception instanceof HttpException && req.path.startsWith('/health')) {
            res.status(exception.getStatus()).json(exception.getResponse());
            return;
        }
        let status = 500;
        let code = 'INTERNAL_ERROR';
        let title = 'Erro interno';
        let detail;
        let fieldErrors;
        let retryAfter;
        let extensions;
        if (exception instanceof AppError) {
            status = exception.getStatus();
            code = exception.code;
            title = exception.title;
            detail = exception.problem.detail;
            fieldErrors = exception.problem.errors;
            retryAfter = exception.problem.retryAfterSeconds;
            extensions = exception.problem.extensions;
        }
        else if (exception instanceof HttpException) {
            status = exception.getStatus();
            const fallback = STATUS_DEFAULTS[status] ?? { code: `HTTP_${status}`, title: 'Erro' };
            code = fallback.code;
            title = fallback.title;
        }
        else {
            // Erro inesperado: registra com o requestId, nunca devolve a mensagem ao cliente.
            this.logger.error({ err: exception instanceof Error ? exception : new Error(String(exception)), reqId: req.id }, 'Erro não tratado');
            captureError(exception, typeof req.id === 'string' ? req.id : undefined);
        }
        if (retryAfter !== undefined)
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfter))));
        res
            .status(status)
            .type('application/problem+json')
            .json({
            type: `${ERROR_BASE}${code.toLowerCase().replaceAll('_', '-')}`,
            title,
            status,
            ...(detail ? { detail } : {}),
            code,
            ...(fieldErrors ? { errors: fieldErrors } : {}),
            // Extensões não sobrescrevem os campos padrão do RFC 9457.
            ...(extensions ? Object.fromEntries(Object.entries(extensions).filter(([key]) => !['type', 'title', 'status', 'detail', 'code', 'errors'].includes(key))) : {}),
        });
    }
};
ProblemFilter = __decorate([
    Catch()
], ProblemFilter);
export { ProblemFilter };
//# sourceMappingURL=problem.filter.js.map