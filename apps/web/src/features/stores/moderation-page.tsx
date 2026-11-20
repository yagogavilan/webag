'use client';

import { CheckCircle, Package } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { SplitLayout } from '@/components/panel/split-layout';
import { Badge, Banner, Button, EmptyState, ErrorState, MessageState, NoAccessState, SkeletonRows, Tabs, cx, ui, useToast } from '@/components/ui';
import { adminApi, keys } from '@/lib/api/admin';
import { moderationApi, moderationKeys, STATUS_LABEL, TAB_LABEL, type AdminProduct, type ModerationTab } from '@/lib/api/admin-moderation';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatCents, formatDay } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';

const T = (id: string) => tid('moderacao', id);
const REASONS = ['Produto proibido', 'Réplica ou falsificação', 'Descrição enganosa', 'Categoria proibida'];
const COUNT_LIMIT = 50;
const TABS: ModerationTab[] = ['review', 'paused', 'removed', 'all'];

const statusTone = (status: AdminProduct['moderationStatus']): 'success' | 'warning' | 'danger' => (status === 'ok' ? 'success' : status === 'review' ? 'warning' : 'danger');

/** A4: moderação de produtos. "Manter no ar" é a ação principal; remover é sempre deliberado, com motivo. */
export function ModerationPage() {
  const { user } = useSession();
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const act = user.adminProfile === 'super_admin' || user.adminProfile === 'operations';
  const allowed = act || user.adminProfile === 'support';
  const [tab, setTab] = useState<ModerationTab>('review');
  const [selected, setSelected] = useState<AdminProduct | null>(null);
  const [dialog, setDialog] = useState<'remove' | 'pause' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A loja que acabou de completar 3 remoções em 30 dias (`storeFlagged`): leva à análise de suspensão (C4). */
  const [flagged, setFlagged] = useState<{ storeId: string; storeName: string | null } | null>(null);

  const query = useInfiniteQuery({
    queryKey: moderationKeys.list(tab),
    queryFn: ({ pageParam }) => moderationApi.list(tab, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: allowed,
  });
  // Contagem da aba "Revisar": a API não devolve totais, então conta a primeira página (até 50).
  const reviewCount = useQuery({ queryKey: moderationKeys.reviewCount, queryFn: () => moderationApi.list('review', undefined, COUNT_LIMIT), enabled: allowed });
  // O nome da categoria vem do cadastro de categorias (só super admin e operação leem; para o suporte a coluna fica em branco).
  const categories = useQuery({ queryKey: keys.categories, queryFn: adminApi.categories, enabled: act, retry: false });
  if (!allowed) return <NoAccessState />;

  const categoryName = new Map((categories.data?.data ?? []).flatMap((node) => [node, ...node.children]).map((node) => [node.id, node.name]));
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const count = reviewCount.data ? `${reviewCount.data.data.length}${reviewCount.data.nextCursor ? '+' : ''}` : null;

  async function run(row: AdminProduct, action: 'pause' | 'remove' | 'restore', reason?: string) {
    const result = await moderationApi.act(row.id, action, reason);
    setSelected(null);
    if (result.storeFlagged) setFlagged({ storeId: row.storeId, storeName: row.storeName });
    await client.invalidateQueries({ queryKey: moderationKeys.all });
    toast.show(action === 'restore' ? 'Produto mantido no ar.' : action === 'remove' ? 'Produto removido. O lojista foi avisado.' : 'Produto pausado.');
  }

  async function keep(row: AdminProduct) {
    setBusy(true);
    setError(null);
    try {
      await run(row, 'restore');
    } catch (caught) {
      setError(saveErrorMessage(caught, 'Não foi possível salvar. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  const reviewing = selected?.moderationStatus === 'review';
  const panel = selected ? (
    <div className={ui.stack} data-testid={T('panel')}>
      <h3 className="wb-text-title2" style={{ margin: 0 }}>{selected.name}</h3>
      <p className="wb-text-body" style={{ margin: 0 }}>
        {selected.basePriceCents === null ? 'Sem preço' : formatCents(selected.basePriceCents)} · <Link href={asRoute(`/admin/lojas/${selected.storeId}`)}>{selected.storeName ?? 'Ver loja'}</Link>
      </p>
      {selected.description ? <p className="wb-text-body" style={{ margin: 0 }}>{selected.description}</p> : <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>Sem descrição.</p>}
      <p style={{ margin: 0 }}>
        <Badge tone={statusTone(selected.moderationStatus)}>{STATUS_LABEL[selected.moderationStatus]}</Badge>
      </p>
      {selected.moderationReason ? <Banner tone="warning" testId={T('signal')}>{selected.moderationReason}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {act ? (
        <>
          <Button size="lg" onClick={() => void keep(selected)} loading={busy} loadingLabel="Salvando…" disabled={!online || selected.moderationStatus === 'ok'} data-testid={T('keep')}>
            {reviewing ? 'Manter no ar' : 'Restaurar produto'}
          </Button>
          <Button variant="secondary" onClick={() => setDialog('pause')} disabled={!online || selected.moderationStatus === 'paused' || selected.moderationStatus === 'removed'} data-testid={T('pause')}>Pausar</Button>
          <Button variant="text" onClick={() => setDialog('remove')} disabled={!online || selected.moderationStatus === 'removed'} data-testid={T('remove')}><span style={{ color: 'var(--wb-color-text-danger)' }}>Remover produto</span></Button>
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
        tabs={TABS.map((id) => ({ id, label: id === 'review' && count ? `Revisar (${count})` : TAB_LABEL[id], testId: T(`tab-${id}`) }))}
      />
      {!online ? <Banner tone="warning" offline>Sem conexão. Mostrando o que já carregou.</Banner> : null}
      {query.isPending ? (
        <SkeletonRows rows={6} height={64} label="Carregando produtos" />
      ) : query.isError && rows.length === 0 ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        tab === 'review' ? (
          <EmptyState icon={CheckCircle} title="Nada para revisar" text="Produtos sinalizados aparecem aqui." actionLabel="Ver todos os produtos" onAction={() => setTab('all')} testId={T('empty')} />
        ) : (
          <MessageState icon={Package} title="Nenhum produto neste filtro." testId={T('empty')}>
            <Button onClick={() => setTab('all')}>Limpar filtros</Button>
          </MessageState>
        )
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <caption>Produtos para moderar</caption>
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Loja</th>
                <th scope="col">Categoria</th>
                <th scope="col">Preço</th>
                <th scope="col">Data</th>
                <th scope="col">Sinal</th>
                <th scope="col">Status</th>
                <th scope="col"><span className={ui.srOnly}>Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid={T(`row-${row.id}`)}>
                  <td data-primary className="wb-text-body-strong">{row.name}</td>
                  <td data-label="Loja">{row.storeName ?? ''}</td>
                  <td data-label="Categoria">{(row.categoryId && categoryName.get(row.categoryId)) || ''}</td>
                  <td data-label="Preço">{row.basePriceCents === null ? 'Sem preço' : formatCents(row.basePriceCents)}</td>
                  <td data-label="Data">{formatDay(row.createdAt)}</td>
                  <td data-label="Sinal">{row.moderationReason ?? ''}</td>
                  <td data-label="Status"><Badge tone={statusTone(row.moderationStatus)}>{STATUS_LABEL[row.moderationStatus]}</Badge></td>
                  <td><Button size="sm" variant="secondary" onClick={() => { setSelected(row); setError(null); }} aria-label={`Abrir ${row.name}`} data-testid={T(`row-${row.id}-open`)}>Abrir</Button></td>
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
      <PageHeader title="Moderação de produtos" action={act ? <Link href={asRoute('/admin/moderacao/regras')} className={cx('wb-text-body-strong')} data-testid={T('rules-link')}>Regras</Link> : undefined} />
      {flagged ? (
        <Banner tone="warning" testId={T('repeat-offender')} action={<Link href={asRoute(`/admin/lojas/${flagged.storeId}`)} data-testid={T('analyze-suspension')}>Analisar suspensão</Link>}>
          {flagged.storeName ?? 'A loja'} teve 3 remoções em 30 dias.
        </Banner>
      ) : null}
      <SplitLayout list={list} panelOpen={selected !== null} onClosePanel={() => setSelected(null)} panelTitle="Produto" panel={panel} />
      {dialog && selected ? (
        <ReasonDialog
          title={dialog === 'remove' ? `Remover ${selected.name}?` : `Pausar ${selected.name}?`}
          description={dialog === 'remove' ? 'O produto sai do app e o lojista é avisado com o motivo. Ele pode contestar por e-mail.' : 'O produto sai do app até você liberar de novo. O lojista é avisado com o motivo.'}
          quickReasons={REASONS}
          confirmLabel={dialog === 'remove' ? 'Remover produto' : 'Pausar produto'}
          destructive={dialog === 'remove'}
          minReason={5}
          onConfirm={(reason) => run(selected, dialog, reason)}
          onClose={() => setDialog(null)}
          testIds={{ dialog: T('reason-dialog'), reason: T(`${dialog}-reason`), confirm: T(`${dialog}-confirm`) }}
        />
      ) : null}
    </div>
  );
}
