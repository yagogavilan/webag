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

/** Códigos do PostgreSQL que significam "saturado", não "bug": consulta cancelada por `statement_timeout` e sem conexão livre no servidor. */
const SATURATION_PG_CODES: ReadonlySet<string> = new Set(['57014', '53300']);
/**
 * BUG-038: o PostgreSQL recusa o byte NUL (`\u0000`) em `text` (22021, invalid byte sequence) e em `jsonb` (22P05, unsupported Unicode escape). É entrada inválida do
 * usuário, não bug: 422 em qualquer rota, sem pilha e sem Sentry, em vez de corrigir campo a campo (hoje e nas rotas futuras).
 */
const INVALID_TEXT_PG_CODES: ReadonlySet<string> = new Set(['22021', '22P05']);

function hasPgCode(exception: unknown, codes: ReadonlySet<string>): boolean {
  let current: unknown = exception;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && codes.has(code)) return true;
    current = cause;
  }
  return false;
}

/** Falha do pool do `pg` quando todas as conexões estão em uso por mais que `connectionTimeoutMillis` (BUG-035). */
const POOL_EXHAUSTED = /timeout exceeded when trying to connect/i;
/** O log de saturação é agregado: uma linha por janela, com a contagem, em vez de uma pilha por requisição. */
const SATURATION_LOG_WINDOW_MS = 10_000;
const SATURATION_RETRY_AFTER_SECONDS = 2;

/** Percorre a cadeia `cause` (o Drizzle embrulha o erro do `pg`). A mensagem só é lida no erro de ponta: o embrulho traz o SQL e os parâmetros. */
function isDbSaturation(exception: unknown): boolean {
  let current: unknown = exception;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && SATURATION_PG_CODES.has(code)) return true;
    if (cause === undefined && POOL_EXHAUSTED.test(current.message)) return true;
    current = cause;
  }
  return false;
}

/** Todo erro sai como application/problem+json (RFC 9457), sem stack trace e sem vazar detalhe interno. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('Problem');
  private saturationPending = 0;
  private lastSaturationLogAt = 0;

  /** BUG-035: 1 aviso por janela com a contagem (sem pilha, sem SQL). A primeira ocorrência avisa na hora. */
  private logSaturation(): void {
    this.saturationPending += 1;
    const now = Date.now();
    if (now - this.lastSaturationLogAt < SATURATION_LOG_WINDOW_MS && this.lastSaturationLogAt !== 0) return;
    this.logger.warn({ event: 'http.db_saturated', count: this.saturationPending, windowMs: SATURATION_LOG_WINDOW_MS }, 'Banco saturado: respondendo 503 com Retry-After');
    this.saturationPending = 0;
    this.lastSaturationLogAt = now;
  }

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
    } else if (hasPgCode(exception, INVALID_TEXT_PG_CODES)) {
      status = 422;
      code = 'INVALID_TEXT';
      title = 'Texto inválido';
      detail = 'O texto contém um caractere inválido (nulo). Remova-o e tente de novo.';
    } else if (isDbSaturation(exception)) {
      // Sob saturação o cliente deve tentar de novo depois, não receber "erro interno" (BUG-035). Sem Sentry: o sinal é a taxa de 503.
      status = 503;
      code = 'SERVICE_UNAVAILABLE';
      title = 'Serviço indisponível no momento';
      detail = 'Estamos com muitas requisições. Tente de novo em instantes.';
      retryAfter = SATURATION_RETRY_AFTER_SECONDS;
      this.logSaturation();
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
