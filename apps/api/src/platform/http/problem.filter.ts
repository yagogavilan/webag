import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { captureError } from '../observability/sentry.js';
import { AppError } from './app-error.js';

const ERROR_BASE = 'https://api.webag.com.br/errors/';

const STATUS_DEFAULTS: Record<number, { code: string; title: string }> = {
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
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('Problem');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    // /health segue o contrato próprio do Terminus (HealthStatus), não o RFC 9457.
    if (exception instanceof HttpException && req.path.startsWith('/health')) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let title = 'Erro interno';
    let detail: string | undefined;
    let fieldErrors: AppError['problem']['errors'];
    let retryAfter: number | undefined;
    let extensions: Record<string, unknown> | undefined;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      title = exception.title;
      detail = exception.problem.detail;
      fieldErrors = exception.problem.errors;
      retryAfter = exception.problem.retryAfterSeconds;
      extensions = exception.problem.extensions;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const fallback = STATUS_DEFAULTS[status] ?? { code: `HTTP_${status}`, title: 'Erro' };
      code = fallback.code;
      title = fallback.title;
    } else {
      // Erro inesperado: registra com o requestId, nunca devolve a mensagem ao cliente.
      this.logger.error(
        { err: exception instanceof Error ? exception : new Error(String(exception)), reqId: req.id },
        'Erro não tratado',
      );
      captureError(exception, typeof req.id === 'string' ? req.id : undefined);
    }

    // Erro NUNCA é cacheável: o `@Header('Cache-Control', 'public, ...')` das rotas públicas é aplicado ANTES do handler e sobreviveria ao 404/5xx
    // (um 404 transitório ficaria preso em proxy por 30 a 60 s). Corrigido junto do I3 do review de desempenho (2026-11-22).
    res.setHeader('Cache-Control', 'private, no-store');
    if (retryAfter !== undefined) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfter))));
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
}
