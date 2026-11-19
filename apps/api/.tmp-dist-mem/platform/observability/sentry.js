import * as Sentry from '@sentry/node';
import { maskCoordinates, maskPii } from '../logging/mask.js';
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-webag-bff-secret', 'x-webag-client-ip', 'x-signature', 'x-forwarded-for', 'idempotency-key']);
/**
 * DT-039 / LGPD: nada de dado pessoal sai da API. Remove corpo, cookies, cabeçalhos sensíveis, IP e usuário; mascara e-mail e
 * telefone em mensagens; tira coordenadas da URL. Pura (testável sem rede).
 */
export function scrubEvent(event) {
    const scrubbed = event;
    delete scrubbed.user;
    delete scrubbed.server_name;
    if (scrubbed.request) {
        const req = scrubbed.request;
        delete req.data;
        delete req.cookies;
        delete req.env;
        if (req.url)
            req.url = maskCoordinates(req.url.replace(/[?#].*$/, (q) => maskCoordinates(q) ?? ''));
        if (typeof req.query_string === 'string')
            req.query_string = maskCoordinates(`?${req.query_string}`)?.slice(1) ?? '';
        if (req.headers) {
            for (const key of Object.keys(req.headers))
                if (SENSITIVE_HEADERS.has(key.toLowerCase()))
                    delete req.headers[key];
        }
    }
    if (scrubbed.message)
        scrubbed.message = maskPii(scrubbed.message);
    for (const exception of scrubbed.exception?.values ?? [])
        if (exception.value)
            exception.value = maskPii(exception.value);
    for (const crumb of scrubbed.breadcrumbs ?? []) {
        delete crumb.data;
        if (crumb.message)
            crumb.message = maskPii(crumb.message);
    }
    delete scrubbed.extra;
    return scrubbed;
}
let enabled = false;
/** Sem DSN fica desligado (DEC-032b). Retorna se ligou. */
export function initSentry(options) {
    if (!options.dsn)
        return false;
    Sentry.init({
        dsn: options.dsn,
        environment: options.environment,
        ...(options.release ? { release: options.release } : {}),
        // Mínimo de coleta por padrão (LGPD); o `scrubEvent` é a segunda barreira.
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false },
        tracesSampleRate: options.tracesSampleRate,
        beforeSend: (event) => scrubEvent(event),
    });
    enabled = true;
    return true;
}
/** Erro inesperado (5xx). O `requestId` vai como tag para casar com o log estruturado. */
export function captureError(error, requestId) {
    if (!enabled)
        return;
    Sentry.captureException(error, requestId ? { tags: { requestId } } : undefined);
}
export function sentryEnabled() {
    return enabled;
}
export async function flushSentry(timeoutMs = 2000) {
    if (enabled)
        await Sentry.flush(timeoutMs);
}
//# sourceMappingURL=sentry.js.map