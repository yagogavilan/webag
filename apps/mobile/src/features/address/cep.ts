import { z } from 'zod';
import { onlyDigits } from '../../lib/masks';

/**
 * Consulta de CEP no ViaCEP (ADR-008 §4). Só o CEP vai à rede (não o nome nem o número). Falha de rede, resposta fora do
 * formato ou CEP inexistente viram o mesmo resultado: o formulário libera os campos para digitar à mão (design D2).
 */
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

export async function lookupCep(cep: string, fetcher: typeof fetch = fetch): Promise<CepLookup> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return { kind: 'not-found' };
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
