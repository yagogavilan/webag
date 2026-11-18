import type { ReactNode } from 'react';

/**
 * Texto dos termos: subconjunto de Markdown (## e ### títulos, **negrito**, lista com "- ", [texto](https://...)).
 * Renderizado como elementos React: HTML colado vira texto, nunca é interpretado (AD5, "nenhum HTML cru aceito").
 */
export type Block = { kind: 'h2' | 'h3' | 'p'; text: string } | { kind: 'ul'; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') });
    if (list.length) blocks.push({ kind: 'ul', items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith('### ')) {
      flush();
      blocks.push({ kind: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'h2', text: line.slice(3).trim() });
    }
    else if (line.startsWith('- ')) {
      if (paragraph.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [, bold, label, url] = match;
    if (bold !== undefined) out.push(<strong key={index}>{bold}</strong>);
    else if (label !== undefined && url !== undefined && SAFE_URL.test(url)) {
      out.push(
        <a key={index} href={url} rel="noopener noreferrer" target="_blank">
          {label}
        </a>,
      );
    } else out.push(match[0]);
    last = at + match[0].length;
    index += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownLite({ source }: { source: string }) {
  return (
    <>
      {parseBlocks(source).map((block, i) => {
        if (block.kind === 'h2') return <h2 key={i}>{renderInline(block.text)}</h2>;
        if (block.kind === 'h3') return <h3 key={i}>{renderInline(block.text)}</h3>;
        if (block.kind === 'ul') {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.text)}</p>;
      })}
    </>
  );
}

