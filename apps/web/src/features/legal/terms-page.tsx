'use client';

import { FileText } from '@phosphor-icons/react';
import { useQueries } from '@tanstack/react-query';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { ButtonLink, Banner, Button, NoAccessState, Skeleton, cx, ui } from '@/components/ui';
import { adminApi, keys } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { formatDay } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { LEGAL_TYPES, currentOf } from './catalog';
import s from '@/components/panel/panel.module.css';

const T = (id: string) => tid('termos', id);

export function TermsPage() {
  const { canView, canEdit } = useSession();
  const results = useQueries({ queries: LEGAL_TYPES.map(({ type }) => ({ queryKey: keys.legal(type), queryFn: () => adminApi.legalVersions(type) })) });
  if (!canView('termos')) return <NoAccessState />;
  const editable = canEdit('termos');
  const failed = results.find((r) => r.isError);
  const forbidden = failed?.error instanceof ApiError && failed.error.status === 403;
  if (forbidden) return <NoAccessState />;

  return (
    <>
      <PageHeader title="Termos e privacidade" description="Cada documento tem a sua própria sequência de versões. Uma versão publicada nunca é editada." />
      {failed ? (
        <Banner tone="danger" testId={T('error')} action={<Button size="sm" variant="secondary" onClick={() => results.forEach((r) => void r.refetch())}>Tentar de novo</Button>}>
          Não conseguimos carregar os documentos agora. Seus dados estão salvos.
        </Banner>
      ) : null}
      <div className={s.docGrid}>
        {LEGAL_TYPES.map(({ type, slug, label }, index) => {
          const result = results[index];
          const versions = result?.data?.data ?? [];
          const current = currentOf(versions);
          return (
            <section key={type} className={ui.card} data-testid={T(`doc-${slug}`)} aria-labelledby={`doc-${slug}-title`}>
              <div className={ui.stack}>
                <h2 id={`doc-${slug}-title`} className="wb-text-title2" style={{ margin: 0 }}>{label}</h2>
                {result?.isPending ? (
                  <Skeleton height={24} label="Carregando documento" />
                ) : result?.data && versions.length === 0 ? (
                  <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>
                    <FileText size={20} aria-hidden="true" /> Nenhuma versão publicada. O app só abre com a versão 1 publicada.
                  </p>
                ) : current ? (
                  <p className="wb-text-body" style={{ margin: 0 }}>Versão {current.version} · vigente desde {formatDay(current.effectiveAt)}</p>
                ) : result?.data ? (
                  <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>Nenhuma versão em vigor ainda.</p>
                ) : null}
                <div className={ui.row} style={{ flexWrap: 'wrap' }}>
                  {editable ? (
                    <ButtonLink href={asRoute(`/admin/termos/${slug}/nova`)} data-testid={T(`doc-${slug}-new-version`)}>
                      {result?.data && versions.length === 0 ? 'Escrever versão 1' : 'Nova versão'}
                    </ButtonLink>
                  ) : null}
                  <ButtonLink href={asRoute(`/admin/termos/${slug}`)} variant="secondary" data-testid={T(`doc-${slug}-versions`)}>Ver versões</ButtonLink>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
