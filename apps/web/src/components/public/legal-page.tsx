import { MarkdownLite } from '@/lib/markdown-lite';
import { Container } from './public-shell';
import type { LegalDoc, Loaded } from '@/server/public-content';
import s from './public.module.css';

const DATE = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function formatLegalDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE.format(date);
}

/**
 * Texto legal publicado no painel (termos e política): versão e data de vigência no topo, corpo renderizado como elementos
 * React (HTML colado vira texto, nunca é interpretado). Sem texto publicado ou com a API fora, mostra o motivo e o caminho de contato.
 */
export function LegalPage({ loaded, fallbackTitle, testId }: { loaded: Loaded<LegalDoc>; fallbackTitle: string; testId: string }) {
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
  return (
    <Container>
      <article className={s.prose} data-testid={`${testId}.document`}>
        <h1 className={`wb-text-display ${s.title}`}>{data.title}</h1>
        <p className={`wb-text-caption ${s.meta}`} data-testid={`${testId}.version`}>
          Versão {data.version}. Em vigor desde {formatLegalDate(data.effectiveAt)}.
        </p>
        <MarkdownLite source={data.content} />
      </article>
    </Container>
  );
}
