import { z } from 'zod';
import { csrfProblem } from '@/server/csrf';
import { publicAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { callApi, clientHints, parseJson } from '@/server/upstream';

/**
 * Exclusão de conta SEM o app (WB-214, SEC-166, SEC-176): passos públicos da API (`/v1/auth/account-deletion/*`) pelo host público.
 * Sem sessão, sem cookie, sem credencial do web. Regras desta rota:
 * - só o host público; CSRF e Origin iguais a `/api/public/privacy-request`; corpo `strictObject` por passo;
 * - o ticket de exclusão trafega só no corpo (nunca em URL, nunca em cookie) e a resposta sai `no-store`;
 * - a resposta é reduzida a uma lista fixa de campos e códigos: nada do que a API disser a mais chega ao navegador, e nenhuma mensagem
 *   diferencia "conta inexistente" de "senha errada" (a API já responde igual; aqui só repassamos o código estável);
 * - nada do corpo (e-mail, senha, código, ticket) vai para log.
 * O limite de tentativas (por IP e por e-mail) é da API; o IP vem do cabeçalho de proxy confiável (`clientHints`).
 */
const email = z.email().max(254);
const code = z.string().regex(/^\d{6}$/);
const ticket = z.string().min(20).max(200);
const password = z.string().min(1).max(200);

const SCHEMAS = {
  start: z.strictObject({ email, password: password.optional() }),
  'verify-code': z.strictObject({ email, code }),
  review: z.strictObject({ deleteTicket: ticket }),
  finish: z.strictObject({ deleteTicket: ticket }),
  cancel: z.strictObject({ email, password, code: code.optional() }),
} as const;
type Step = keyof typeof SCHEMAS;

const isStep = (value: string): value is Step => Object.hasOwn(SCHEMAS, value);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const NO_STORE = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };

function ok(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function blockersOf(value: unknown): { kind: string; id: string; number: string | null; status: string }[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!isObject(item) || typeof item.kind !== 'string' || typeof item.id !== 'string' || typeof item.status !== 'string') return [];
    return [{ kind: item.kind, id: item.id, number: typeof item.number === 'string' ? item.number : null, status: item.status }];
  });
}

/** Reduz a resposta de sucesso da API aos campos que a tela usa. `null` = resposta fora do contrato (vira 503). */
function successBody(step: Step, text: string): unknown {
  const body = parseJson<unknown>(text);
  if (!isObject(body)) return null;
  if ((step === 'start' || step === 'verify-code') && typeof body.deleteTicket === 'string' && typeof body.expiresIn === 'number') {
    return { deleteTicket: body.deleteTicket, expiresIn: body.expiresIn };
  }
  if (step === 'start' && body.sent === true) return { sent: true };
  if (step === 'review' && typeof body.canDelete === 'boolean') {
    const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    return {
      canDelete: body.canDelete,
      blockers: blockersOf(body.blockers),
      ownsStore: body.ownsStore === true,
      anonymizationDays: num(body.anonymizationDays),
      fiscalRetentionYears: num(body.fiscalRetentionYears),
      regretHours: num(body.regretHours),
    };
  }
  if (step === 'finish' && (body.status === 'completed' || body.status === 'pending') && typeof body.effectiveAt === 'string') {
    return { status: body.status, effectiveAt: body.effectiveAt, cancelableUntil: typeof body.cancelableUntil === 'string' ? body.cancelableUntil : null };
  }
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ step: string }> }) {
  const { step } = await context.params;
  if (!publicAllowedOnHost(request.headers) || !isStep(step)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');
  const parsed = SCHEMAS[step].safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, 'VALIDATION_ERROR', 'Dados inválidos');

  const result = await callApi(`/v1/auth/account-deletion/${step}`, { method: 'POST', body: JSON.stringify(parsed.data), hints: clientHints(request.headers) });
  const upstream = parseJson<Record<string, unknown>>(result.text);
  const upstreamCode = typeof upstream?.code === 'string' ? upstream.code : '';

  if (result.status === 204 && step === 'cancel') return new Response(null, { status: 204, headers: NO_STORE });
  if (result.status === 200) {
    const body = successBody(step, result.text);
    return body ? ok(body) : problem(503, 'UPSTREAM_UNAVAILABLE', 'Indisponível');
  }
  if (result.status === 429) {
    const response = problem(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas');
    const retry = result.headers.get('retry-after');
    if (retry && /^\d{1,6}$/.test(retry)) response.headers.set('retry-after', retry);
    return response;
  }
  if (result.status === 400) {
    if (upstreamCode === 'CODE_INVALID' || upstreamCode === 'CODE_EXPIRED') return problem(400, upstreamCode, 'Código incorreto ou vencido');
    return problem(400, 'VALIDATION_ERROR', 'Dados inválidos');
  }
  if (result.status === 401) return problem(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
  // SEC-168/176: senha certa com a conta sob ataque. Só a API decide; a tela passa a pedir o código enviado ao e-mail.
  if (result.status === 403 && upstreamCode === 'LOGIN_CODE_REQUIRED') return problem(403, 'LOGIN_CODE_REQUIRED', 'Código necessário');
  if (result.status === 409 && upstreamCode === 'DELETION_BLOCKED') {
    const response = problem(409, 'DELETION_BLOCKED', 'Conclua antes de excluir');
    const blockers = blockersOf(upstream?.blockers);
    return withBlockers(response, blockers);
  }
  if (result.status === 410) return problem(410, 'DELETE_TICKET_INVALID', 'Pedido vencido ou já usado');
  return problem(503, 'UPSTREAM_UNAVAILABLE', 'Indisponível');
}

/** `problem()` não leva campos extras: reescreve o corpo mantendo os cabeçalhos. */
function withBlockers(base: Response, blockers: ReturnType<typeof blockersOf>): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title: 'Conclua antes de excluir', status: 409, code: 'DELETION_BLOCKED', blockers }), { status: 409, headers: base.headers });
}
