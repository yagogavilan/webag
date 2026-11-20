import { companyIdentity } from './company';
import { parseBlocks, type Block } from './markdown-lite';

/**
 * Textos legais do site (DEC-080/081). O texto vem da API (`legal_documents`, versão imutável) com variáveis `{{NOME}}`; aqui elas são
 * preenchidas a cada exibição a partir do ambiente do servidor web. Nenhum dado da empresa fica no código, e nenhuma data de vigência
 * é fixa: sem valor, a variável vira "a definir" (honesto, nunca inventado). O conteúdo jurídico em si é do PO e do advogado.
 */

export const PENDING = 'a definir';

type Env = Record<string, string | undefined>;

/** Dados opcionais da API (`GET /v1/help`) usados só quando o ambiente não define o valor (mesmos contatos da página de exclusão). */
export interface HelpFallback {
  officerName?: string | null;
  officerEmail?: string | null;
  supportEmail?: string | null;
  supportWhatsapp?: string | null;
}

/** `LEGAL_REVIEWED=true`: o jurídico aprovou os textos (J1 a J16). Só então o rótulo "versão para revisão" sai (DEC-078, DEC-080). */
export function legalReviewed(env: Env = process.env): boolean {
  return env.LEGAL_REVIEWED?.trim().toLowerCase() === 'true';
}

/** Valor de variável como texto simples de uma linha: nada que vire negrito, link ou título quando entra no Markdown. */
function plain(value: string | null | undefined, max = 160): string | null {
  const clean = (value ?? '').replace(/[\r\n\t*[\]`<>{}]+/g, ' ').replace(/\s+/g, ' ').replace(/^[#\-\s]+/, '').slice(0, max);
  return clean || null;
}

const EMAIL = /^[^\s@,;?&=<>"()[\]]+@[^\s@,;?&=<>"()[\]]+\.[^\s@,;?&=<>"()[\]]{2,}$/;
const email = (value: string | null | undefined): string | null => {
  const v = (value ?? '').trim();
  return EMAIL.test(v) && v.length <= 120 ? v : null;
};

/** "5511999990000" vira "(11) 99999-0000" (com DDI 55, ou só DDD + número); outro formato = não exibe. */
export function formatWhatsapp(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  const m = /^(\d{2})(9?\d{4})(\d{4})$/.exec(local);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : null;
}

const DAY = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** "AAAA-MM-DD" ou ISO completo para "20 de novembro de 2026"; inválido = null. */
export function formatVigencia(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00-03:00`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : DAY.format(date);
}

export interface LegalDocRef {
  version: number;
  effectiveAt: string;
}

/**
 * Valores das variáveis. `SITE_URL` é a origem pública já validada pelo servidor. `VIGENCIA`: com o texto em revisão é sempre "a definir";
 * aprovado, vale `LEGAL_VIGENCIA` (AAAA-MM-DD, se o fundador definir) ou a data de vigência da versão publicada pelo admin.
 */
export function legalVariables(input: { env?: Env; doc: LegalDocRef; siteUrl: string; help?: HelpFallback | null }): Record<string, string> {
  const env = input.env ?? process.env;
  const help = input.help ?? {};
  const company = companyIdentity(env);
  const days = Number.parseInt(env.AVISO_MUDANCA_DIAS ?? '', 10);
  const vigencia = legalReviewed(env) ? (formatVigencia(env.LEGAL_VIGENCIA) ?? formatVigencia(input.doc.effectiveAt)) : null;
  const values: Record<string, string | null> = {
    COMPANY_NAME: company ? plain(company.legalName, 120) : null,
    COMPANY_CNPJ: company?.cnpj ?? null,
    COMPANY_ADDRESS: plain(env.COMPANY_ADDRESS, 200),
    FORO_COMARCA: plain(env.FORO_COMARCA, 80),
    DPO_NAME: plain(env.DPO_NAME) ?? plain(help.officerName, 120),
    DPO_EMAIL: email(env.DPO_EMAIL) ?? email(help.officerEmail),
    SUPPORT_EMAIL: email(env.SUPPORT_EMAIL) ?? email(help.supportEmail),
    SUPPORT_WHATSAPP: formatWhatsapp(env.SUPPORT_WHATSAPP) ?? formatWhatsapp(env.NEXT_PUBLIC_SUPPORT_WHATSAPP) ?? formatWhatsapp(help.supportWhatsapp),
    HOSTING_PROVIDER: plain(env.HOSTING_PROVIDER, 120),
    EMAIL_PROVIDER: plain(env.EMAIL_PROVIDER, 120),
    MP_LEGAL_NAME: plain(env.MP_LEGAL_NAME, 120),
    AVISO_MUDANCA_DIAS: Number.isInteger(days) && days >= 1 && days <= 90 ? String(days) : null,
    SITE_URL: input.siteUrl,
    VERSAO: String(input.doc.version),
    VIGENCIA: vigencia,
  };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? PENDING]));
}

/**
 * Troca `{{VARIAVEL}}` pelo valor. Em revisão, "Em vigor desde {{VIGENCIA}}" vira "Vigência a definir" (a frase não faz sentido sem data).
 * Variável desconhecida também vira "a definir": uma chave `{{...}}` nunca aparece para o leitor.
 */
export function fillLegalText(content: string, vars: Record<string, string>): string {
  const pendingDate = vars.VIGENCIA === PENDING;
  const withSentence = pendingDate ? content.replace(/Em vigor desde \{\{VIGENCIA\}\}/g, 'Vigência a definir') : content;
  return withSentence.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? PENDING);
}

export interface TocEntry {
  id: string;
  label: string;
}

/** Âncora de um título: "3. Sua conta" vira `secao-3`, "3.1 Dados" vira `secao-3-1`; sem número, um índice estável. */
export function headingId(text: string, index: number): string {
  const numbered = /^(\d+(?:\.\d+)*)\.?\s/.exec(text);
  return numbered?.[1] ? `secao-${numbered[1].replace(/\./g, '-')}` : `secao-t${index}`;
}

export interface LegalStructure {
  blocks: Block[];
  /** Id de cada bloco `h2`/`h3` (por posição em `blocks`). */
  ids: Map<number, string>;
  toc: TocEntry[];
}

/** Estrutura do texto: blocos, âncoras únicas e o índice (só os títulos de seção `##`). */
export function legalStructure(source: string): LegalStructure {
  const blocks = parseBlocks(source);
  const ids = new Map<number, string>();
  const used = new Set<string>();
  const toc: TocEntry[] = [];
  blocks.forEach((block, index) => {
    if (block.kind !== 'h2' && block.kind !== 'h3') return;
    let id = headingId(block.text, index);
    while (used.has(id)) id = `${id}-b`;
    used.add(id);
    ids.set(index, id);
    if (block.kind === 'h2') toc.push({ id, label: block.text.replace(/\*\*/g, '') });
  });
  return { blocks, ids, toc };
}
