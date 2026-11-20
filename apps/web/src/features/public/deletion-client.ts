/**
 * Cliente das rotas públicas de exclusão (`/api/public/account-deletion/<passo>`, SEC-166). Sem cookie (`credentials: 'omit'`), com o
 * cabeçalho de cliente (CSRF) e tempo limite. Nunca lança: devolve o resultado tipado, com o `code` estável do BFF.
 */
export type DeletionStep = 'start' | 'verify-code' | 'review' | 'finish' | 'cancel';

export interface Blocker {
  kind: 'order' | 'exchange' | 'store_order' | 'store_exchange' | 'store_refund';
  id: string;
  number: string | null;
  status: string;
}

export type StepResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; retryAfterSeconds: number | null; blockers: Blocker[] };

export async function postStep<T = unknown>(step: DeletionStep, body: Record<string, unknown>): Promise<StepResult<T>> {
  try {
    const response = await fetch(`/api/public/account-deletion/${step}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webag-client': 'web' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      return { ok: true, status: response.status, data: data as T };
    }
    const problem = (await response.json().catch(() => null)) as { code?: unknown; blockers?: unknown } | null;
    const retry = Number(response.headers.get('retry-after'));
    return {
      ok: false,
      status: response.status,
      code: typeof problem?.code === 'string' ? problem.code : 'UNKNOWN',
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null,
      blockers: Array.isArray(problem?.blockers) ? (problem.blockers as Blocker[]) : [],
    };
  } catch {
    return { ok: false, status: 0, code: 'NETWORK', retryAfterSeconds: null, blockers: [] };
  }
}

/** Mensagem única por tipo de falha. Nenhuma diferencia "conta inexistente" de "senha errada". */
export function failureMessage(result: Extract<StepResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return 'Sem conexão. Conecte-se para continuar.';
  if (result.status === 429) {
    const minutes = result.retryAfterSeconds ? Math.max(1, Math.ceil(result.retryAfterSeconds / 60)) : null;
    if (minutes && minutes < 60) return `Muitas tentativas. Tente de novo em ${minutes} min.`;
    return 'Muitas tentativas. Tente de novo em 1 hora.';
  }
  if (result.code === 'INVALID_CREDENTIALS') return 'E-mail ou senha incorretos.';
  if (result.code === 'CODE_INVALID') return 'Código incorreto. Confira o código ou peça um novo.';
  if (result.code === 'CODE_EXPIRED') return 'O código venceu. Peça um novo.';
  if (result.code === 'DELETE_TICKET_INVALID') return 'O pedido venceu ou já foi usado. Comece de novo.';
  if (result.code === 'VALIDATION_ERROR') return 'Confira os dados e tente de novo.';
  return 'Não conseguimos agora. Tente de novo.';
}
