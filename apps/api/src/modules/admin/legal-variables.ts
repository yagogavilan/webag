/**
 * SEC-187: a versão publicada de um documento legal é imutável, inclusive nos fatos contratuais (razão social, CNPJ, sede, encarregado,
 * foro, prestadores, prazo de aviso). Esses valores são escritos NO TEXTO na publicação; trocar um valor é uma versão nova. Só as variáveis
 * abaixo continuam como `{{...}}` no texto gravado, porque dependem de quem exibe (domínio do site) ou da própria versão (número e vigência).
 */
export const DISPLAY_VARIABLES = ['SITE_URL', 'VERSAO', 'VIGENCIA'] as const;

/** Variáveis contratuais de empresa que o seed preenche a partir do ambiente ao gravar a versão (o admin publica o texto já preenchido). */
export const COMPANY_VARIABLES = [
  'COMPANY_NAME',
  'COMPANY_CNPJ',
  'COMPANY_ADDRESS',
  'FORO_COMARCA',
  'DPO_NAME',
  'DPO_EMAIL',
  'SUPPORT_EMAIL',
  'SUPPORT_WHATSAPP',
  'HOSTING_PROVIDER',
  'EMAIL_PROVIDER',
  'MP_LEGAL_NAME',
  'AVISO_MUDANCA_DIAS',
] as const;
export type CompanyVariable = (typeof COMPANY_VARIABLES)[number];

/** Marcação visível quando falta o valor: nunca se inventa dado (o jurídico ou o fundador completa e publica nova versão). */
export const PENDING = 'a definir';

const TOKEN = /\{\{[^{}]*\}\}/g;
const ALLOWED_TOKEN = new RegExp(`^\\{\\{\\s*(?:${DISPLAY_VARIABLES.join('|')})\\s*\\}\\}$`);

/** Trechos `{{...}}` que NÃO podem estar num texto publicado (qualquer um fora de `DISPLAY_VARIABLES`, e chaves soltas ou malformadas). */
export function forbiddenLegalVariables(content: string): string[] {
  const bad = new Set<string>();
  for (const token of content.match(TOKEN) ?? []) if (!ALLOWED_TOKEN.test(token)) bad.add(token.length > 60 ? `${token.slice(0, 57)}...` : token);
  if (/\{\{|\}\}/.test(content.replace(TOKEN, ''))) bad.add('{{ ou }} sem par');
  return [...bad];
}

type Env = Record<string, string | undefined>;

/** Valor de variável como texto simples de uma linha: nada que vire negrito, link, título ou `{{ }}` quando entra no Markdown. */
function plain(value: string | undefined, max = 160): string | null {
  const clean = (value ?? '').replace(/[\r\n\t*_[\]`<>{}]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[#\-\s]+/, '').slice(0, max);
  return clean || null;
}

const EMAIL = /^[^\s@,;?&=<>"()[\]*_{}]+@[^\s@,;?&=<>"()[\]*_{}]+\.[^\s@,;?&=<>"()[\]*_{}]{2,}$/;
const email = (value: string | undefined): string | null => {
  const v = (value ?? '').trim();
  return EMAIL.test(v) && v.length <= 120 ? v : null;
};

/** CNPJ numérico ou alfanumérico (2026), com ou sem máscara. */
const CNPJ = /^[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?[0-9]{2}$/;

/** "5511999990000" vira "(11) 99999-0000" (com DDI 55, ou só DDD + número); outro formato = null. */
export function formatWhatsapp(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  const m = /^(\d{2})(9?\d{4})(\d{4})$/.exec(local);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : null;
}

export interface CompanyValues {
  /** Valor final de cada variável (`PENDING` quando o ambiente não traz valor válido). */
  values: Record<CompanyVariable, string>;
  /** Variáveis que ficaram "a definir". */
  pending: CompanyVariable[];
}

/** Lê o ambiente do seed, valida e higieniza. Valor ausente ou inválido vira "a definir" (visível), nunca um chute. */
export function resolveCompanyValues(env: Env): CompanyValues {
  const name = (env.COMPANY_NAME?.trim() || env.COMPANY_LEGAL_NAME?.trim() || undefined)?.replace(/\s+/g, ' ');
  const cnpj = env.COMPANY_CNPJ?.trim().toUpperCase();
  const days = Number.parseInt(env.AVISO_MUDANCA_DIAS ?? '', 10);
  const raw: Record<CompanyVariable, string | null> = {
    COMPANY_NAME: plain(name, 120),
    COMPANY_CNPJ: cnpj && CNPJ.test(cnpj) ? cnpj : null,
    COMPANY_ADDRESS: plain(env.COMPANY_ADDRESS, 200),
    FORO_COMARCA: plain(env.FORO_COMARCA, 80),
    DPO_NAME: plain(env.DPO_NAME, 120),
    DPO_EMAIL: email(env.DPO_EMAIL),
    SUPPORT_EMAIL: email(env.SUPPORT_EMAIL),
    SUPPORT_WHATSAPP: formatWhatsapp(env.SUPPORT_WHATSAPP) ?? formatWhatsapp(env.NEXT_PUBLIC_SUPPORT_WHATSAPP),
    HOSTING_PROVIDER: plain(env.HOSTING_PROVIDER, 120),
    EMAIL_PROVIDER: plain(env.EMAIL_PROVIDER, 120),
    MP_LEGAL_NAME: plain(env.MP_LEGAL_NAME, 120),
    AVISO_MUDANCA_DIAS: Number.isInteger(days) && days >= 1 && days <= 90 ? String(days) : null,
  };
  const values = {} as Record<CompanyVariable, string>;
  const pending: CompanyVariable[] = [];
  for (const key of COMPANY_VARIABLES) {
    values[key] = raw[key] ?? PENDING;
    if (raw[key] === null) pending.push(key);
  }
  return { values, pending };
}

/** Troca as variáveis de empresa pelo valor, em UMA passada (o valor nunca é reinterpretado). `SITE_URL`, `VERSAO` e `VIGENCIA` ficam como estão. */
export function fillCompanyVariables(content: string, values: Record<CompanyVariable, string>): string {
  return content.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (token, key: string) => ((COMPANY_VARIABLES as readonly string[]).includes(key) ? values[key as CompanyVariable] : token));
}
