'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SolarIcon, cx } from '@/components/ui';
import { reviewsApi, reviewsKeys, type ReviewsSummary } from '@/lib/api/reviews';
import { ltid } from '@/lib/testid';
import s from './reviews.module.css';

const T = (id: string) => ltid('avaliacoes', id);
const average = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Texto lido por leitor de tela e usado no rótulo do cartão: "Nota 4,7 em 12 avaliações, 2 sem resposta". */
export function summaryText(data: ReviewsSummary): string {
  if (data.total === 0 || data.average === null) return 'Ainda sem avaliações';
  const base = `Nota ${average(data.average)} em ${data.total} ${data.total === 1 ? 'avaliação' : 'avaliações'}`;
  return data.withoutReply > 0 ? `${base}, ${data.withoutReply} sem resposta` : `${base}, todas respondidas`;
}

/**
 * Resumo das avaliações (W.6, `GET /stores/{id}/reviews/summary`). No Início é um cartão que leva às Avaliações; em Avaliações mostra também a
 * distribuição. Falha silenciosa: o bloco some e o resto da tela segue (a lista tem o próprio erro).
 */
export function ReviewsSummaryCard({ storeId, variant }: { storeId: string; variant: 'home' | 'page' }) {
  const query = useQuery({ queryKey: reviewsKeys.summary(storeId), queryFn: () => reviewsApi.summary(storeId), staleTime: 60_000, retry: 1 });
  const data = query.data;
  if (!data) return null;
  const empty = data.total === 0 || data.average === null;
  const body = (
    <>
      <span className={s.sumHead}>
        <SolarIcon name="star" size={24} duotone />
        <span className="wb-text-label">Avaliação</span>
      </span>
      <span className={s.sumValue} data-testid={T('summary-average')}>{empty ? '—' : average(data.average!)}</span>
      <span className={cx('wb-text-caption', s.sumHint)} data-testid={T('summary-hint')}>
        {empty ? 'Quando um cliente avaliar, a nota aparece aqui.' : `${data.total} ${data.total === 1 ? 'avaliação' : 'avaliações'}${data.withoutReply > 0 ? ` · ${data.withoutReply} sem resposta` : ' · todas respondidas'}`}
      </span>
      {variant === 'page' && !empty ? (
        <ul className={s.dist} aria-label="Quantidade de avaliações por nota">
          {([5, 4, 3, 2, 1] as const).map((n) => {
            const count = data.distribution[String(n) as '1'];
            return (
              <li key={n} className={s.distRow}>
                <span className="wb-text-caption-strong">{n} {n === 1 ? 'estrela' : 'estrelas'}</span>
                <span className={s.distBar} aria-hidden="true"><span className={s.distFill} style={{ width: `${Math.round((count / data.total) * 100)}%` }} /></span>
                <span className="wb-text-caption">{count}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
  return variant === 'home' ? (
    <Link href={'/lojista/avaliacoes' as never} className={s.sumCard} aria-label={`${summaryText(data)}. Abrir avaliações.`} data-testid="lojista.home.reviews">
      {body}
    </Link>
  ) : (
    <section className={s.sumCard} aria-label={summaryText(data)} data-testid={T('summary')}>
      {body}
    </section>
  );
}
