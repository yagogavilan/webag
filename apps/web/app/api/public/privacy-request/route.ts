import { z } from 'zod';
import { csrfProblem } from '@/server/csrf';
import { publicAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { callApi, clientHints, parseJson } from '@/server/upstream';

/**
 * Pedido ao encarregado (WB-214, formulário público de `/excluir-conta`). Sem sessão. A API é quem limita (5 por hora por IP e por e-mail)
 * e quem responde igual exista ou não conta com o e-mail (SEC-152); esta rota só valida o formato, confere CSRF e Origin, repassa o IP
 * confiável e devolve apenas `protocol` e `dueAt`. Nada do corpo vai para log.
 */
const Body = z.strictObject({
  type: z.enum(['access', 'correction', 'deletion', 'portability', 'objection', 'other']),
  email: z.email().max(254),
  message: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  if (!publicAllowedOnHost(request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, 'VALIDATION_ERROR', 'Dados inválidos');
  const result = await callApi('/v1/privacy/requests', { method: 'POST', body: JSON.stringify(parsed.data), hints: clientHints(request.headers) });
  if (result.status === 202) {
    const receipt = parseJson<{ protocol?: unknown; dueAt?: unknown }>(result.text);
    if (typeof receipt?.protocol === 'string' && typeof receipt.dueAt === 'string') {
      return Response.json({ protocol: receipt.protocol, dueAt: receipt.dueAt }, { status: 202, headers: { 'cache-control': 'no-store' } });
    }
  }
  if (result.status === 429) {
    const response = problem(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas');
    const retry = result.headers.get('retry-after');
    if (retry) response.headers.set('retry-after', retry);
    return response;
  }
  if (result.status === 400) return problem(400, 'VALIDATION_ERROR', 'Dados inválidos');
  return problem(503, 'UPSTREAM_UNAVAILABLE', 'Indisponível');
}
