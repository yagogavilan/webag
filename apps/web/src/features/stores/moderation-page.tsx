'use client';

import { CheckCircle } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { SplitLayout } from '@/components/panel/split-layout';
import { Badge, Banner, Button, EmptyState, ErrorState, NoAccessState, SkeletonRows, Tabs, cx, ui, useToast } from '@/components/ui';
import { moderationApi, moderationKeys, type ModerationRow, type ModerationTab } from '@/lib/api/admin-moderation';
import { ApiError } from '@/lib/api/errors';
import { formatCents, formatDay } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';

const T = (id: string) => tid('moderacao', id);
const REMOVE_REASONS = ['Produto proibido', 'Réplica ou falsificação', 'Descrição enganosa', 'Categoria proibida'];

/** A4: moderação de produtos. "Manter no ar" é a ação principal; remover é sempre deliberado, com motivo. */
export function ModerationPage() {
  const { user } = useSession();
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const act = user.adminProfile === 'super_admin' || user.adminProfile === 'operations';
  const allowed = act || user.adminProfile === 'support';
  const [tab, setTab] = useState<ModerationTab>('review');
  const [selected, setSelected] = useState<ModerationRow | null>(null);
  const [dialog, setDialog] = useState<'remove' | 'pause' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: moderationKeys.list(tab),
    queryFn: ({ pageParam }) => moderationApi.list(tab, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: allowed,
  });
  if (!allowed) return <NoAccessState />;

  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const counts = query.data?.pages[0]?.counts;

  async function done(message: string) {
    setSelected(null);
    await client.invalidateQueries({ queryKey: moderationKeys.all });
    toast.show(message);
  }

  async function keep(row: ModerationRow) {
    setBusy(true);
    setError(null);
    try {
      await moderationApi.keep(row.id);
      await done('Produto mantido no ar.');
    } catch {
      setError('Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const panel = selected ? (
    <div className={ui.stack} data-testid={T('panel')}>
      {selected.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto pública do produto, tamanho fixo
        <img src={selected.photoUrl} alt={selected.name} width={240} height={240} style={{ borderRadius: 8, objectFit: 'cover', maxWidth: '100%' }} />
      ) : null}
      <h3 className="wb-text-title2" style={{ margin: 0 }}>{selected.name}</h3>
      <p className="wb-text-body" style={{ margin: 0 }}>{formatCents(selected.priceCents)} · <Link href={asRoute(`/admin/lojas/${selected.storeId}`)}>{selected.storeName}</Link></p>
      {selected.description ? <p className="wb-text-body" style={{ margin: 0 }}>{selected.description}</p> : null}
      {selected.signal ? <Badge tone="warning">{selected.signal}</Badge> : null}
      {selected.storeRemovals30d >= 3 ? (
        <Banner tone="warning" action={<Link href={asRoute(`/admin/lojas/${selected.storeId}`)}>Analisar suspensão</Link>}>
          Esta loja teve {selected.storeRemovals30d} remoções em 30 dias.
        </Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {act ? (
        <>
          <Button size="lg" onClick={() => void keep(selected)} loading={busy} loadingLabel="Salvando…" disabled={!online} data-testid={T('keep')}>Manter no ar</Button>
          <Button variant="secondary" onClick={() => setDialog('pause')} disabled={!online} data-testid={T('pause')}>Pausar</Button>
          <Button variant="text" onClick={() => setDialog('remove')} disabled={!online} data-testid={T('remove')}><span style={{ color: 'var(--wb-color-text-danger)' }}>Remover produto</span></Button>
        </>
      ) : (
        <Banner tone="info">Você pode ver este produto, mas não moderar.</Banner>
      )}
    </div>
  ) : null;

  const list = (
    <div className={ui.stack}>
      <Tabs
        label="Filas de moderação"
        value={tab}
        onChange={(next) => {
          setTab(next);
          setSelected(null);
        }}
        tabs={[
          { id: 'review', label: `Revisar${counts ? ` (${counts.review})` : ''}`, testId: T('tab-review') },
          { id: 'reported', label: `Denunciados${counts ? ` (${counts.reported})` : ''}`, testId: T('tab-reported') },
          { id: 'all', label: 'Todos', testId: T('tab-all') },
        ]}
      />
      {!online ? <Banner tone="warning" offline>Sem conexão. Mostrando o que já carregou.</Banner> : null}
      {query.isPending ? (
        <SkeletonRows rows={6} height={64} label="Carregando produtos" />
      ) : query.isError && rows.length === 0 ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle} title={tab === 'all' ? 'Nenhum produto' : 'Nada para revisar'} text="Produtos sinalizados e denunciados aparecem aqui." actionLabel={tab !== 'all' ? 'Ver todos os produtos' : undefined} onAction={() => setTab('all')} testId={T('empty')} />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <caption>Produtos para moderar</caption>
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Loja</th>
                <th scope="col">Preço</th>
                <th scope="col">Data</th>
                <th scope="col">Sinal</th>
                <th scope="col">Denúncias</th>
                <th scope="col"><span className={ui.srOnly}>Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid={T(`row-${row.id}`)}>
                  <td data-primary className="wb-text-body-strong">{row.name}</td>
                  <td data-label="Loja">{row.storeName}</td>
                  <td data-label="Preço">{formatCents(row.priceCents)}</td>
                  <td data-label="Data">{formatDay(row.createdAt)}</td>
                  <td data-label="Sinal">{row.signal ?? ''}</td>
                  <td data-label="Denúncias">{row.reports > 0 ? `${row.reports} ${row.reports === 1 ? 'denúncia' : 'denúncias'}` : ''}</td>
                  <td><Button size="sm" variant="secondary" onClick={() => setSelected(row)} aria-label={`Abrir ${row.name}`} data-testid={T(`row-${row.id}-open`)}>Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.hasNextPage ? <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…">Carregar mais</Button> : null}
        </div>
      )}
    </div>
  );

  return (
    <div className={ui.stack}>
      <PageHeader title="Moderação de produtos" action={<Link href={asRoute('/admin/moderacao/regras')} className={cx('wb-text-body-strong')} data-testid={T('rules-link')}>Regras</Link>} />
      <SplitLayout list={list} panelOpen={selected !== null} onClosePanel={() => setSelected(null)} panelTitle="Produto" panel={panel} />
      {dialog && selected ? (
        <ReasonDialog
          title={dialog === 'remove' ? `Remover ${selected.name}?` : `Pausar ${selected.name}?`}
          description={dialog === 'remove' ? 'O produto sai do app e o lojista é avisado com o motivo. Ele pode contestar por e-mail.' : 'O produto sai do app até você liberar de novo.'}
          quickReasons={REMOVE_REASONS}
          confirmLabel={dialog === 'remove' ? 'Remover produto' : 'Pausar produto'}
          destructive={dialog === 'remove'}
          minReason={5}
          onConfirm={async (reason) => {
            if (dialog === 'remove') await moderationApi.remove(selected.id, reason);
            else await moderationApi.pause(selected.id, reason);
            await done(dialog === 'remove' ? 'Produto removido. O lojista foi avisado.' : 'Produto pausado.');
          }}
          onClose={() => setDialog(null)}
          testIds={{ dialog: T('reason-dialog'), reason: T(`${dialog}-reason`), confirm: T(`${dialog}-confirm`) }}
        />
      ) : null}
    </div>
  );
}
