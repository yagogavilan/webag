'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';
import { useOnline } from '@/lib/use-online';
import { ErrorState, NoAccessState, SkeletonRows } from './states';

const SLOW_MS = 8000;

interface Props<T> {
  query: UseQueryResult<T>;
  /** Substitui o skeleton padrão por um com a forma do conteúdo. */
  skeleton?: ReactNode;
  skeletonLabel?: string;
  /** Se devolver um nó, ele é mostrado no lugar do conteúdo (estado vazio com próximo passo). */
  empty?: (data: T) => ReactNode | null;
  children: (data: T) => ReactNode;
}

/**
 * Os quatro estados de toda tela de dados: carregando (skeleton; depois de 8 s vira "Está demorando"),
 * vazio, erro com "Tentar de novo" e sem conexão. 403 vira "sem acesso". Com cache, mostra o cache e atualiza em silêncio.
 */
export function QueryBoundary<T>({ query, skeleton, skeletonLabel, empty, children }: Props<T>) {
  const online = useOnline();
  const [slow, setSlow] = useState(false);
  const loading = query.isPending;

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [loading]);

  if (query.data !== undefined) {
    const emptyNode = empty?.(query.data);
    return <>{emptyNode ?? children(query.data)}</>;
  }
  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiError && error.status === 403) return <NoAccessState />;
    return <ErrorState offline={!online || (error instanceof ApiError && error.isNetwork)} onRetry={() => void query.refetch()} />;
  }
  if (slow) return <ErrorState slow onRetry={() => void query.refetch()} />;
  return <>{skeleton ?? <SkeletonRows label={skeletonLabel} />}</>;
}
