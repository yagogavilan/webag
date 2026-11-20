/**
 * Texto legal vindo da API (`legal_documents`) em subconjunto de Markdown: `##`/`###`, parágrafos, listas com "- ", `**negrito**` e
 * `[texto](https://...)`. O app mostra como texto (nunca interpreta HTML) e não abre link de dentro do texto: o endereço aparece por escrito.
 * Variáveis `{{...}}` que o servidor ainda não preencheu viram "a definir" (nunca aparecem entre chaves).
 */
export type LegalBlock = { kind: 'h2' | 'h3' | 'p' | 'li'; text: string };

export const PENDING = 'a definir';

export interface LegalContext {
  version: number;
  /** Origem pública do site (`EXPO_PUBLIC_WEB_URL`). */
  siteUrl: string;
}

/** Preenche o que o app sabe (site, versão); o resto vira "a definir". Em revisão, "Em vigor desde {{VIGENCIA}}" vira "Vigência a definir". */
export function fillLegal(content: string, ctx: LegalContext): string {
  const known: Record<string, string> = { SITE_URL: ctx.siteUrl.replace(/\/+$/, ''), VERSAO: String(ctx.version) };
  return content
    .replace(/Em vigor desde \{\{\s*VIGENCIA\s*\}\}/g, 'Vigência a definir')
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
