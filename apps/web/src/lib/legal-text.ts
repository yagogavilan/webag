import { parseBlocks, type Block } from './markdown-lite';

/**
 * Textos legais do site (DEC-080/081). O texto vem da API (`legal_documents`, versão imutável). SEC-187: os fatos contratuais (empresa,
 * CNPJ, encarregado, foro...) já vêm ESCRITOS no texto da versão (a API os grava na publicação); a exibição só resolve `SITE_URL`
 * (origem pública), `VERSAO` e `VIGENCIA` (da própria versão publicada, `effectiveAt`). Nada vem do ambiente. Qualquer outro `{{...}}`
 * (versão antiga, anterior ao SEC-187) vira "a definir", visível, nunca um valor do ambiente. O conteúdo jurídico é do PO e do advogado.
 */

export const PENDING = 'a definir';

type Env = Record<string, string | undefined>;

/** `LEGAL_REVIEWED=true`: o jurídico aprovou os textos (J1 a J16). Só então o rótulo "versão para revisão" sai (DEC-078, DEC-080). */
export function legalReviewed(env: Env = process.env): boolean {
  return env.LEGAL_REVIEWED?.trim().toLowerCase() === 'true';
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
 * Valores das variáveis de exibição. `SITE_URL` é a origem pública já validada pelo servidor. `VIGENCIA`: com o texto em revisão é sempre
 * "a definir"; aprovado (`LEGAL_REVIEWED=true`), é a data de vigência da versão publicada pelo admin.
 */
export function legalVariables(input: { env?: Env; doc: LegalDocRef; siteUrl: string }): Record<string, string> {
  const env = input.env ?? process.env;
  const vigencia = legalReviewed(env) ? formatVigencia(input.doc.effectiveAt) : null;
  return { SITE_URL: input.siteUrl, VERSAO: String(input.doc.version), VIGENCIA: vigencia ?? PENDING };
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
