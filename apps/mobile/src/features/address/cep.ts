import { lookupCep as lookupCepApi } from '@webag/shared';
import { z } from 'zod';
import { request } from '../../api/http';
import { ApiError } from '../../api/problem';
import { sessionStore } from '../../api/session';
import { onlyDigits } from '../../lib/masks';

/**
 * Consulta de CEP. Com conta, vai pela API do Webag (`GET /v1/cep/{cep}`, cacheada e com limite; o aparelho não fala com terceiros,
 * inventário de lojas pendência 1). Visitante ainda consulta o ViaCEP direto (ADR-008 §4) porque a rota da API exige conta: quando o
 * backend abrir a rota (sem login, com limite por IP), troque `CEP_VIA_API_FOR_GUESTS` e o ViaCEP sai do app.
 * Só o CEP vai à rede (não o nome nem o número). Falha de rede, resposta fora do formato ou CEP inexistente viram o mesmo resultado:
 * o formulário libera os campos para digitar à mão (design D2).
 */
export const CEP_VIA_API_FOR_GUESTS = false;
const CEP_TIMEOUT_MS = 8_000;

const viaCepSchema = z.object({
  erro: z.union([z.boolean(), z.string()]).optional(),
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  localidade: z.string().optional(),
  uf: z.string().optional(),
});

export interface CepResult {
  street: string;
  district: string;
  city: string;
  state: string;
}

export type CepLookup = { kind: 'found'; value: CepResult } | { kind: 'not-found' } | { kind: 'unavailable' };

export interface LookupOptions {
  /** Força o ViaCEP direto com este `fetch` (teste). Sem isto, a conta vai pela API e o visitante pelo ViaCEP. */
  fetcher?: typeof fetch;
}

export async function lookupCep(cep: string, options: LookupOptions = {}): Promise<CepLookup> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return { kind: 'not-found' };
  const viaApi = !options.fetcher && (CEP_VIA_API_FOR_GUESTS || sessionStore.getState().status === 'authenticated');
  return viaApi ? lookupViaApi(digits) : lookupDirect(digits, options.fetcher ?? fetch);
}

/** `GET /v1/cep/{cep}`: 404 = não existe; 422 `CEP_LOOKUP_UNAVAILABLE` ou qualquer falha = indisponível (preencher à mão). */
async function lookupViaApi(digits: string): Promise<CepLookup> {
  try {
    const found = await request((init) => lookupCepApi(digits, init), { retry: true, auth: CEP_VIA_API_FOR_GUESTS && sessionStore.getState().status !== 'authenticated' ? 'none' : 'required' });
    if (!found.city) return { kind: 'not-found' };
    return { kind: 'found', value: { street: found.street ?? '', district: found.neighborhood ?? '', city: found.city, state: found.state || 'SP' } };
  } catch (error) {
    return error instanceof ApiError && error.status === 404 ? { kind: 'not-found' } : { kind: 'unavailable' };
  }
}

async function lookupDirect(digits: string, fetcher: typeof fetch): Promise<CepLookup> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CEP_TIMEOUT_MS);
  try {
    const response = await fetcher(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal });
    if (response.status === 400 || response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'unavailable' };
    const parsed = viaCepSchema.safeParse(await response.json());
    if (!parsed.success) return { kind: 'unavailable' };
    const data = parsed.data;
    if (data.erro === true || data.erro === 'true' || !data.localidade) return { kind: 'not-found' };
    return {
      kind: 'found',
      value: {
        street: data.logradouro ?? '',
        district: data.bairro ?? '',
        city: data.localidade,
        state: data.uf ?? 'SP',
      },
    };
  } catch {
    return { kind: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
