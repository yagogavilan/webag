/**
 * Texto legal vindo da API (`legal_documents`) em subconjunto de Markdown: `##`/`###`, parágrafos, listas com "- ", `**negrito**` e
 * `[texto](https://...)`. O app mostra como texto (nunca interpreta HTML) e não abre link de dentro do texto: o endereço aparece por escrito.
 * SEC-187: os fatos contratuais (empresa, CNPJ, encarregado, foro...) já vêm ESCRITOS no texto da versão; o app resolve só `SITE_URL`, `VERSAO`
 * e `VIGENCIA` (de `effectiveAt`, só com o texto aprovado). Qualquer outro `{{...}}` (versão antiga) vira "a definir", nunca aparece entre chaves.
 */
export type LegalBlock = { kind: 'h2' | 'h3' | 'p' | 'li'; text: string };

export const PENDING = 'a definir';

export interface LegalContext {
  version: number;
  /** Origem pública do site (`EXPO_PUBLIC_WEB_URL`). */
  siteUrl: string;
  /** `effectiveAt` da versão publicada (ISO). Só é usada com `reviewed`. */
  effectiveAt?: string | null;
  /** Jurídico aprovou o texto (`EXPO_PUBLIC_LEGAL_REVIEWED`, igual ao `LEGAL_REVIEWED` do site). Falso: "Vigência a definir". */
  reviewed?: boolean;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** ISO (UTC) para "20 de novembro de 2026" no horário de Brasília (UTC-3, sem horário de verão); inválido = null. Sem `Intl`: independe do motor. */
export function formatVigencia(iso: string | null | undefined): string | null {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms - 3 * 3_600_000);
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Preenche site, versão e vigência. Em revisão (ou sem data válida), "Em vigor desde {{VIGENCIA}}" vira "Vigência a definir". */
export function fillLegal(content: string, ctx: LegalContext): string {
  const vigencia = ctx.reviewed ? formatVigencia(ctx.effectiveAt) : null;
  const known: Record<string, string> = { SITE_URL: ctx.siteUrl.replace(/\/+$/, ''), VERSAO: String(ctx.version) };
  if (vigencia) known.VIGENCIA = vigencia;
  return content
    .replace(/Em vigor desde \{\{\s*VIGENCIA\s*\}\}/g, vigencia ? `Em vigor desde ${vigencia}` : 'Vigência a definir')
    .replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, key: string) => known[key] ?? PENDING);
}

/** Tira o negrito e escreve o endereço dos links: `[texto](url)` vira "texto (url)", ou só a url quando o texto já é o endereço. */
export function plainInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => (label === url || label.startsWith('http') ? url : `${label} (${url})`));
}

export function parseLegal(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: plainInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith('### ')) {
      flush();
      blocks.push({ kind: 'h3', text: plainInline(line.slice(4).trim()) });
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'h2', text: plainInline(line.slice(3).trim()) });
    } else if (line.startsWith('- ')) {
      flush();
      blocks.push({ kind: 'li', text: plainInline(line.slice(2).trim()) });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}
