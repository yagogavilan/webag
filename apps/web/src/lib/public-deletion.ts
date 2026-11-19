/**
 * Fatos citados na página pública de exclusão (SEC-178). ÚNICO lugar com esses números: a página, os testes e o texto de ajuda leem
 * daqui; nenhum prazo fica solto em JSX.
 *
 * Origem dos valores: padrões dos parâmetros da plataforma (`exclusao_arrependimento_horas`, `retencao_fiscal_anos`,
 * `retencao_log_acesso_meses`) e a constante `DSR_DEADLINE_DAYS` da API (15 dias, LGPD art. 19 II). A página pública não lê esses
 * parâmetros (o endpoint público ainda não os expõe: `docs/gestao/fila-backend-dev.md`), então o operador pode ajustá-los por variável
 * de ambiente (`PUBLIC_DELETION_*`, ver `infra/env.example`) quando o admin mudar o parâmetro. Dentro da exclusão (passo de revisão) a
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

/** Lê os prazos do ambiente; valor ausente, não inteiro ou fora da faixa cai no padrão (a página nunca mostra um número absurdo). */
export function deletionFacts(env: Record<string, string | undefined> = process.env): DeletionFacts {
  const out: DeletionFacts = { ...DELETION_FACTS_DEFAULT };
  for (const key of Object.keys(ENV_KEYS) as (keyof DeletionFacts)[]) {
    const raw = env[ENV_KEYS[key]]?.trim();
    if (!raw || !/^\d{1,4}$/.test(raw)) continue;
    const value = Number(raw);
    const [min, max] = LIMITS[key];
    if (value >= min && value <= max) out[key] = value;
  }
  return out;
}
