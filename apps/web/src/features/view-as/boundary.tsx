'use client';

import { Lock } from '@phosphor-icons/react';
import { useEffect, type ReactNode } from 'react';
import { Banner, ErrorState, MessageState, SkeletonRows } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { useOnline } from '@/lib/use-online';
import { T } from './banner';

/** O tempo da visão não pausa: este aviso acompanha o erro e o "sem conexão" (spec 4.4). */
export const KEEPS_RUNNING = 'O tempo da visualização continua correndo.';

/** Etiqueta "Só o lojista": cadeado + texto (nunca só cor), texto estático, sem foco. */
export function OnlyMerchantTag({ label = 'Só o lojista' }: { label?: string }) {
  return (
    <span className="wb-text-caption-strong" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--wb-color-text-secondary)' }} data-testid={T('only-merchant')}>
      <Lock size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

/** O mínimo que a fronteira precisa de uma consulta (cabe em `useQuery`, `useInfiniteQuery` e em duas consultas juntas). */
export interface BoundaryQuery<T> {
  data: T | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface Props<T> {
  query: BoundaryQuery<T>;
  /** O servidor encerrou a visão (`VIEW_AS_EXPIRED`): a página cai em "A visualização terminou" e limpa os dados. */
  onExpired: () => void;
  /** Vazio da tela, com o texto próprio dela. */
  isEmpty?: (data: T) => boolean;
  empty: { title: string; text: string };
  children: (data: T) => ReactNode;
}

/**
 * Carregando, vazio, erro e sem conexão da visão (spec 4.4). Diferente do `QueryBoundary`: 403 nunca vira "sem acesso" aqui.
 * `VIEW_AS_EXPIRED` encerra a visão; `VIEW_AS_READ_ONLY` vira "Esta parte é só do lojista." Nenhum `code` aparece na tela.
 */
export function ViewAsBoundary<T>({ query, onExpired, isEmpty, empty, children }: Props<T>) {
  const online = useOnline();
  const error = query.error;
  const expired = error instanceof ApiError && error.status === 403 && error.code === 'VIEW_AS_EXPIRED';
  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);

  if (query.data !== undefined) {
    return isEmpty?.(query.data) ? <MessageState icon={Lock} title={empty.title} text={empty.text} testId={T('empty')} /> : <>{children(query.data)}</>;
  }
  if (expired) return null;
  if (query.isError) {
    if (error instanceof ApiError && error.status === 403 && error.code === 'VIEW_AS_READ_ONLY') {
      return (
        <div data-testid={T('read-only')} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <OnlyMerchantTag />
          <p className="wb-text-body" style={{ margin: 0 }}>Esta parte é só do lojista.</p>
        </div>
      );
    }
    const offline = !online || (error instanceof ApiError && error.isNetwork);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {offline ? <Banner tone="warning" offline>{KEEPS_RUNNING}</Banner> : null}
        <ErrorState offline={offline} title="Não conseguimos carregar esta tela" text={`Tente de novo em instantes. ${KEEPS_RUNNING}`} onRetry={() => void query.refetch()} testId={T('error')} />
      </div>
    );
  }
  return <SkeletonRows rows={5} height={72} label="Carregando" />;
}
