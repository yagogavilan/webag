import { z } from 'zod';
import { csrfProblem } from '@/server/csrf';
import { publicAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { CARD_TOKEN } from '@/server/card-intent';
import { callApi, clientHints } from '@/server/upstream';

/**
 * Conclui a intenção de cartão (página pública `/pagar/cartao`, B.2). O navegador manda só o TOKEN que o MP.js gerou
 * (nunca número, validade ou CVV: esses campos vivem nos iframes do Mercado Pago). Sem sessão de painel; a credencial
 * é o token da intenção, de uso único. Esta rota só repassa à API, que decide tudo (valor, dono, uso único).
 */
const Body = z.strictObject({
  intent: z.string().regex(CARD_TOKEN),
  card: z.strictObject({
    token: z.string().min(8).max(200),
    installments: z.number().int().min(1).max(3),
    paymentMethodId: z.string().max(60).optional(),
    issuerId: z.string().max(60).optional(),
  }),
});

export async function POST(request: Request) {
  if (!publicAllowedOnHost(request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, 'VALIDATION_ERROR', 'Dados inválidos', 'Confira os dados do cartão e tente de novo.');
  const { intent, card } = parsed.data;
  const result = await callApi(`/v1/card-intents/${intent}/pay`, { method: 'POST', body: JSON.stringify({ card }), hints: clientHints(request.headers) });
  const headers = new Headers({ 'cache-control': 'no-store' });
  const type = result.headers.get('content-type');
  if (type) headers.set('content-type', type);
  const retry = result.headers.get('retry-after');
  if (retry) headers.set('retry-after', retry);
  return new Response(result.text || null, { status: result.status, headers });
}
