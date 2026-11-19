/**
 * Identificação do titular do serviço (razão social e CNPJ), exigida no rodapé de sites de comércio eletrônico (Decreto 7.962/2013,
 * art. 2º, I) e pelas lojas de aplicativos. Vem de variáveis de ambiente (`COMPANY_LEGAL_NAME`, `COMPANY_CNPJ`), nunca do código:
 * o valor real só existe depois da abertura da empresa (decisão do fundador). Sem valor válido, o rodapé não mostra nada em vez de
 * inventar um dado. Os valores de `infra/env.example` são EXEMPLOS (CNPJ zerado, inválido de propósito).
 *
 * [REVISAR JURÍDICO] J11/J12: confirmar com o contador e o advogado o que deve constar (razão social, CNPJ, endereço, e-mail).
 */
export interface CompanyIdentity {
  legalName: string;
  cnpj: string;
}

/** CNPJ numérico (14 dígitos) ou alfanumérico (2026), com ou sem máscara. */
const CNPJ = /^[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?[0-9]{2}$/;

export function companyIdentity(env: Record<string, string | undefined> = process.env): CompanyIdentity | null {
  const legalName = env.COMPANY_LEGAL_NAME?.trim().replace(/\s+/g, ' ');
  const cnpj = env.COMPANY_CNPJ?.trim().toUpperCase();
  if (!legalName || legalName.length > 120 || !cnpj || !CNPJ.test(cnpj)) return null;
  return { legalName, cnpj };
}
