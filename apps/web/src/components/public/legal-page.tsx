import type { ReactNode } from 'react';
import { fillLegalText, legalStructure } from '@/lib/legal-text';
import { renderInline } from '@/lib/markdown-lite';
import { Container } from './public-shell';
import type { LegalDoc, Loaded } from '@/server/public-content';
import s from './public.module.css';

const DATE = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function formatLegalDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE.format(date);
}

/** Aviso do texto em revisão (DEC-078): só sai quando `LEGAL_REVIEWED=true`. Honesto e discreto, sem a palavra "minuta". */
export const REVIEW_NOTICE = 'Versão para revisão. Vigência a definir.';

interface LegalPageProps {
  loaded: Loaded<LegalDoc>;
  fallbackTitle: string;
  testId: string;
  /** Valores de `{{VARIAVEL}}` (ver `lib/legal-text.ts`). Sem eles, a variável vira "a definir". */
  variables?: Record<string, string>;
  /** `LEGAL_REVIEWED=true`: o jurídico aprovou o texto. Falso (padrão) mostra o aviso de revisão. */
  reviewed?: boolean;
  /** Links no fim da página (outros documentos), já como elementos. */
  footer?: ReactNode;
}

/**
 * Texto legal publicado no painel (termos, política e trocas): título, aviso de revisão ou versão e vigência, índice com âncoras e as
 * seções numeradas, tudo como elementos React (HTML colado vira texto, nunca é interpretado). Sem texto publicado ou com a API
 * fora, mostra o motivo e o caminho de contato. Componente de servidor: o índice usa `<details>`, sem JavaScript.
 */
export function LegalPage({ loaded, fallbackTitle, testId, variables = {}, reviewed = false, footer }: LegalPageProps) {
  if (loaded.status !== 'ok') {
    return (
      <Container>
        <h1 className={`wb-text-display ${s.title}`}>{fallbackTitle}</h1>
        <div className={s.notice} role="status" data-testid={`${testId}.unavailable`}>
          <p className="wb-text-body">
            {loaded.status === 'missing' ? 'Este documento ainda não foi publicado.' : 'Não conseguimos carregar este documento agora. Atualize a página em instantes.'}
          </p>
        </div>
      </Container>
    );
  }
  const { data } = loaded;
  const { blocks, ids, toc } = legalStructure(fillLegalText(data.content, variables));
  return (
    <Container>
      <article className={s.prose} data-testid={`${testId}.document`}>
        <h1 className={`wb-text-display ${s.title}`}>{data.title}</h1>
        <p className={`wb-text-caption ${s.meta}`} data-testid={`${testId}.version`}>
          {reviewed ? `Versão ${data.version}. Em vigor desde ${variables.VIGENCIA ?? formatLegalDate(data.effectiveAt)}.` : REVIEW_NOTICE}
        </p>
        {toc.length > 1 ? (
          <nav aria-label="Índice do documento" className={s.toc} data-testid={`${testId}.toc`}>
            <details>
              <summary>Índice ({toc.length} seções)</summary>
              <ul>
                {toc.map((entry) => (
                  <li key={entry.id}>
                    <a href={`#${entry.id}`}>{entry.label}</a>
                  </li>
                ))}
              </ul>
            </details>
          </nav>
        ) : null}
        {blocks.map((block, i) => {
          if (block.kind === 'h2') return <h2 key={i} id={ids.get(i)}>{renderInline(block.text)}</h2>;
          if (block.kind === 'h3') return <h3 key={i} id={ids.get(i)}>{renderInline(block.text)}</h3>;
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
      </article>
      {footer}
    </Container>
  );
}
