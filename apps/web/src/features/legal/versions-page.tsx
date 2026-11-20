'use client';

import { ArrowLeft, CheckCircle, FileText, MinusCircle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, Button, ButtonLink, Dialog, EmptyState, NoAccessState, QueryBoundary, cx, ui } from '@/components/ui';
import { adminApi, keys, type LegalDocument } from '@/lib/api/admin';
import { formatDay } from '@/lib/format';
import { MarkdownLite } from '@/lib/markdown-lite';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { STATUS_LABEL, statusOf, typeFromSlug } from './catalog';
import s from '@/components/panel/panel.module.css';

const T = (id: string) => tid('termos', id);

export function VersionsPage({ slug }: { slug: string }) {
  const { canView, canEdit } = useSession();
  const router = useRouter();
  const meta = typeFromSlug(slug);
  const query = useQuery({ queryKey: keys.legal(meta?.type ?? 'privacy'), queryFn: () => adminApi.legalVersions(meta!.type), enabled: meta !== null });
  const [open, setOpen] = useState<LegalDocument | null>(null);
  if (!canView('termos') || !meta) return <NoAccessState />;

  return (
    <>
      <Link href="/admin/termos" className={cx('wb-text-body-strong', ui.row)} style={{ textDecoration: 'none' }}>
        <ArrowLeft size={20} aria-hidden="true" /> Termos e privacidade
      </Link>
      <PageHeader title={meta.label} description="Versão publicada nunca é editada. Para corrigir, publique uma nova versão." action={canEdit('termos') ? <ButtonLink href={asRoute(`/admin/termos/${slug}/nova`)} data-testid={T('new-version')}>Nova versão</ButtonLink> : undefined} />
      <QueryBoundary
        query={query}
        skeletonLabel="Carregando versões"
        empty={(page) =>
          page.data.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhuma versão publicada" text="O app só abre com a versão 1 dos termos publicada." actionLabel={canEdit('termos') ? 'Escrever versão 1' : undefined} onAction={() => router.push(`/admin/termos/${slug}/nova` as never)} testId={T('empty')} />
          ) : null
        }
      >
        {(page) => (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption>Versões de {meta.label}</caption>
              <thead>
                <tr>
                  <th scope="col">Versão</th>
                  <th scope="col">Vigência</th>
                  <th scope="col">Mudança relevante</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className={ui.srOnly}>Ler</span></th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((doc) => {
                  const status = statusOf(doc, page.data);
                  return (
                    <tr key={doc.id} data-testid={T(`version-${doc.id}`)}>
                      <td data-primary className="wb-text-body-strong">Versão {doc.version}</td>
                      <td data-label="Vigência">{formatDay(doc.effectiveAt)}</td>
                      <td data-label="Mudança relevante">
                        {doc.relevantChange ? <Badge tone="warning" icon={<CheckCircle size={16} aria-hidden="true" />}>Sim</Badge> : <Badge tone="neutral" icon={<MinusCircle size={16} aria-hidden="true" />}>Não</Badge>}
                      </td>
                      <td data-label="Status"><Badge tone={status === 'current' ? 'success' : status === 'scheduled' ? 'info' : 'neutral'}>{STATUS_LABEL[status]}</Badge></td>
                      <td>
                        <Button size="sm" variant="secondary" onClick={() => setOpen(doc)} aria-label={`Ler a versão ${doc.version}`} data-testid={T(`version-${doc.id}-open`)}>Ler</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
      {open ? (
        <Dialog title={`${meta.label}, versão ${open.version}`} wide onClose={() => setOpen(null)} testId={T('reader')} actions={<Button variant="text" onClick={() => setOpen(null)}>Fechar</Button>}>
          <div className={s.prose}>
            <MarkdownLite source={open.content} />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
