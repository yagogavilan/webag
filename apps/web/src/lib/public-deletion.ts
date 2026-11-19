/**
 * Fatos citados na página pública de exclusão (SEC-178). ÚNICO lugar com esses números: a página, os testes e o texto de ajuda leem
 * daqui; nenhum prazo fica solto em JSX.
 *
 * Origem dos valores: padrões dos parâmetros da plataforma (`exclusao_arrependimento_horas`, `retencao_fiscal_anos`,
 * `retencao_log_acesso_meses`) e a constante `DSR_DEADLINE_DAYS` da API (15 dias, LGPD art. 19 II). Desde W.1 a API os publica em `GET /v1/help` > `privacy` e a página
 * lê de lá; as variáveis `PUBLIC_DELETION_*` (ver `infra/env.example`) ficam só de reserva se a API não responder. Dentro da exclusão (passo de revisão) a
 * tela mostra sempre o valor real que a API devolve; este texto é só a explicação geral.
 *
 * [REVISAR JURÍDICO] J1-J14 (`docs/decisoes.md`, DEC-059): os quatro prazos, a base legal de cada guarda (obrigação fiscal; Marco Civil
 * art. 15; prova do consentimento) e a frase "não pode ser desfeita" precisam do parecer do advogado do fundador antes do G5.
 */
export interface DeletionFacts {
  /** Horas para desistir (arrependimento) antes de a exclusão ficar definitiva. */
  regretHours: number;
  /** Anos de guarda de pedidos e pagamentos, sem identificação direta (obrigação fiscal e contábil). */
  fiscalRetentionYears: number;
  /** Meses de guarda dos registros de acesso (Marco Civil da Internet, art. 15: 6 meses). */
  accessLogMonths: number;
  /** Dias para o encarregado responder um pedido de titular. */
  privacyAnswerDays: number;
}

export const DELETION_FACTS_DEFAULT: DeletionFacts = { regretHours: 72, fiscalRetentionYears: 5, accessLogMonths: 6, privacyAnswerDays: 15 };

const LIMITS = { regretHours: [1, 720], fiscalRetentionYears: [1, 20], accessLogMonths: [1, 60], privacyAnswerDays: [1, 60] } as const;
const ENV_KEYS = {
  regretHours: 'PUBLIC_DELETION_REGRET_HOURS',
  fiscalRetentionYears: 'PUBLIC_DELETION_FISCAL_YEARS',
  accessLogMonths: 'PUBLIC_DELETION_ACCESS_LOG_MONTHS',
  privacyAnswerDays: 'PUBLIC_DELETION_ANSWER_DAYS',
} as const satisfies Record<keyof DeletionFacts, string>;

/** Os quatro prazos como a API os publica em `GET /v1/help` > `privacy` (SEC-178 / W.1). Todos opcionais: API antiga ou campo ausente cai no ambiente. */
export type ApiDeletionFacts = Partial<Record<keyof DeletionFacts, number>> | null | undefined;
const API_KEYS = { regretHours: 'deletionRegretHours', fiscalRetentionYears: 'fiscalRetentionYears', accessLogMonths: 'accessLogMonths', privacyAnswerDays: 'privacyAnswerDays' } as const satisfies Record<keyof DeletionFacts, string>;

/** Os campos de `privacy` que carregam prazos, com o nome do contrato (`deletionRegretHours` etc.). */
export function factsFromPrivacy(privacy: Partial<Record<(typeof API_KEYS)[keyof typeof API_KEYS], unknown>> | null | undefined): ApiDeletionFacts {
  if (!privacy) return null;
  const out: Partial<Record<keyof DeletionFacts, number>> = {};
  for (const key of Object.keys(API_KEYS) as (keyof DeletionFacts)[]) {
    const value = privacy[API_KEYS[key]];
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

/**
 * Prazos citados na página. Ordem de confiança: o valor REAL da API (parâmetros da plataforma), depois a variável de ambiente (reserva,
 * quando a API não responde ou é antiga) e por último o padrão. Valor ausente, não inteiro ou fora da faixa é ignorado (a página nunca
 * mostra um número absurdo). `regretHours = 0` só vale vindo da API: significa exclusão imediata, sem prazo para desistir.
 */
export function deletionFacts(env: Record<string, string | undefined> = process.env, api?: ApiDeletionFacts): DeletionFacts {
  const out: DeletionFacts = { ...DELETION_FACTS_DEFAULT };
  for (const key of Object.keys(ENV_KEYS) as (keyof DeletionFacts)[]) {
    const [min, max] = LIMITS[key];
    const fromApi = api?.[key];
    if (typeof fromApi === 'number' && Number.isInteger(fromApi) && fromApi >= (key === 'regretHours' ? 0 : min) && fromApi <= max) {
      out[key] = fromApi;
      continue;
    }
    const raw = env[ENV_KEYS[key]]?.trim();
    if (!raw || !/^\d{1,4}$/.test(raw)) continue;
    const value = Number(raw);
    if (value >= min && value <= max) out[key] = value;
  }
  return out;
}
