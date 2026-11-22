'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { ActionMenu, Badge, Banner, Button, Dialog, ErrorState, SkeletonRows, Tabs, TabPanel, cx, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { adminStoresApi, storeKeys, type AdminStoreDetail } from '@/lib/api/admin-stores';
import { formatDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ACCESS_REASON_FOR, STATUS_LABEL, SUSPEND_REASONS } from './catalog';
import { OpenViewAsDialog } from '@/features/view-as/open-dialog';
import { useViewAsState } from '@/features/view-as/use-view-as';
import { viewAsKeys } from '@/lib/api/view-as';
import { DocumentViewer } from './doc-viewer';
import { EditProfileDialog, PauseDialog, ResumeDialog } from './edit-dialogs';
import { HistoryTab, HoursPauseTab, OverviewTab } from './store-ficha';
import s from './stores.module.css';

const T = (id: string) => tid('loja', id);
export type StoreTabId = 'resumo' | 'horario' | 'dados' | 'documentos' | 'historico';
export const isStoreTab = (value: string | undefined): value is StoreTabId => value === 'resumo' || value === 'horario' || value === 'dados' || value === 'documentos' || value === 'historico';

const TONE = { approved: 'success', live: 'success', suspended: 'danger', rejected: 'danger', correction_requested: 'warning', in_review: 'info', draft: 'neutral' } as const;

/**
 * Ficha da loja já decidida (A3 + WB-350/351): abas na URL (`?aba=`), números de 30 dias, dados e pausa editáveis com motivo e versão,
 * histórico por loja e "Ver como o lojista". A tela só reflete a matriz de permissões; a API barra de verdade (403).
 */
export function StoreDetail({ detail, initialTab = 'resumo' }: { detail: AdminStoreDetail; initialTab?: StoreTabId }) {
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const router = useRouter();
  const { can } = useSession();
  const { store } = detail;
  const name = store.name ?? 'a loja';
  const decide = can('stores:decide');
  const canEditStore = can('stores:write');
  const canDocuments = can('stores:documents');
  const [tab, setTabState] = useState<StoreTabId>(initialTab === 'documentos' && !canDocuments ? 'resumo' : initialTab);
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | 'edit' | 'pause' | 'resume' | 'view-as' | null>(null);
  const overview = useQuery({ queryKey: storeKeys.overview(store.id), queryFn: () => adminStoresApi.overview(store.id) });
  const viewState = useViewAsState();
  // A aba vai para a URL: o suporte manda o link ao colega e o voltar funciona.
  const setTab = (next: StoreTabId) => {
    setTabState(next);
    router.replace(asRoute(`/admin/lojas/${store.id}?aba=${next}`));
  };
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);

  async function done(message: string) {
    await client.invalidateQueries({ queryKey: storeKeys.all });
    toast.show(message);
  }

  async function reactivate() {
    setReactivating(true);
    setReactivateError(null);
    try {
      await adminStoresApi.reactivate(store.id);
      setDialog(null);
      await done(`${name} reativada.`);
    } catch {
      setReactivateError('Não foi possível reativar. Nada foi alterado. Tente de novo.');
    } finally {
      setReactivating(false);
    }
  }

  const tabs: { id: StoreTabId; label: string }[] = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'horario', label: 'Horário e pausa' },
    { id: 'dados', label: 'Dados' },
    ...(canDocuments ? [{ id: 'documentos' as const, label: 'Documentos' }] : []),
    { id: 'historico', label: 'Histórico' },
  ];
  const current = detail.documents.filter((doc) => doc.current);
  const data = overview.data;
  const reload = () => overview.refetch();

  return (
    <div className={ui.stack}>
      <PageHeader
        title={store.name ?? 'Loja'}
        description={store.address?.city ? `${store.address.city} - ${store.address.state ?? ''}` : undefined}
        action={
          <span className={ui.row}>
            <Badge tone={TONE[store.status]} testId={T('status-badge')}>{STATUS_LABEL[store.status]}</Badge>
            {can('view-as:open') ? (
              <Button variant="secondary" icon={<Eye size={20} aria-hidden="true" />} onClick={() => setDialog('view-as')} disabled={!online} data-testid={T('view-as')}>
                Ver como o lojista
              </Button>
            ) : null}
            {decide && store.status === 'suspended' ? (
              <Button onClick={() => setDialog('reactivate')} disabled={!online} data-testid={T('reactivate')}>Reativar loja</Button>
            ) : null}
            {decide && store.status === 'approved' ? (
              <ActionMenu label="Mais ações" testId={T('more-menu')} actions={[{ label: 'Suspender loja', danger: true, onSelect: () => setDialog('suspend'), testId: T('suspend') }]} />
            ) : null}
          </span>
        }
      />
      {!canEditStore ? <Banner tone="info" testId={T('read-only')}>Você pode ver, mas não editar.</Banner> : null}
      {!online && canEditStore ? <Banner tone="warning" offline>Conecte-se para editar. Nada foi alterado.</Banner> : null}
      {store.status === 'suspended' && store.decisionReason ? <Banner tone="danger">Motivo da suspensão: {store.decisionReason}</Banner> : null}
      {store.status === 'rejected' && store.decisionReason ? <Banner tone="warning">Motivo da recusa: {store.decisionReason}</Banner> : null}
      {detail.sameDocument.length > 0 ? <Banner tone="warning">Há outra loja com o mesmo CPF/CNPJ.</Banner> : null}
      <Tabs label="Seções da loja" value={tab} onChange={setTab} tabs={tabs} />
      <TabPanel id={tab}>
        {tab === 'resumo' || tab === 'horario' ? (
          overview.isPending ? (
            <SkeletonRows rows={3} height={80} label="Carregando a loja" />
          ) : !data ? (
            <ErrorState offline={!online || (overview.error instanceof ApiError && overview.error.isNetwork)} title="Não conseguimos carregar esta loja agora" text="Tente de novo em instantes." onRetry={() => void overview.refetch()} testId={T('overview-error')} />
          ) : tab === 'resumo' ? (
            <OverviewTab overview={data} canEdit={canEditStore && online} onEdit={() => setDialog('edit')} />
          ) : (
            <HoursPauseTab overview={data} canEdit={canEditStore && online} onPause={() => setDialog('pause')} onResume={() => setDialog('resume')} />
          )
        ) : null}
        {tab === 'dados' ? (
          <dl className={s.dataList} data-testid={T('data')}>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Tipo</dt>
            <dd>{store.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}</dd>
            {store.legalName ? (
              <>
                <dt className={cx('wb-text-caption-strong', ui.muted)}>Razão social</dt>
                <dd>{store.legalName}</dd>
              </>
            ) : null}
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Responsável</dt>
            <dd>{detail.owner.name}</dd>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Conta de recebimento</dt>
            <dd>{detail.paymentAccount ? (detail.paymentAccount.holderMatchesStore ? `Conectada, titular ${detail.paymentAccount.holderDocumentMasked}` : 'Titular diferente do cadastro') : 'Não conectada'}</dd>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Endereço</dt>
            <dd>{store.address ? `${store.address.street ?? ''}, ${store.address.number ?? ''} - ${store.address.neighborhood ?? ''}, ${store.address.city ?? ''}/${store.address.state ?? ''}` : 'Sem endereço'}</dd>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Cadastro criado</dt>
            <dd>{formatDateTime(store.createdAt)}</dd>
          </dl>
        ) : null}
        {tab === 'documentos' && canDocuments ? <DocumentViewer storeId={store.id} documents={current} reason={ACCESS_REASON_FOR.other} selectedId={selectedDoc} onSelect={setSelectedDoc} /> : null}
        {tab === 'historico' ? (
          <div className={ui.stack}>
            <HistoryTab storeId={store.id} />
            <h2 className="wb-text-title2">Situação da loja</h2>
            {detail.history.length === 0 ? (
              <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('history-empty')}>Nenhum evento ainda.</p>
            ) : (
              <ol className={s.history} data-testid={T('history')}>
                {[...detail.history].reverse().map((event) => (
                  <li key={`${event.at}-${event.to}`}>
                    <span className="wb-text-body-strong">{STATUS_LABEL[event.to]}</span> <span className={cx('wb-text-caption', ui.muted)}>{formatDateTime(event.at)}</span>
                    {event.reason ? <div className="wb-text-body">{event.reason}</div> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </TabPanel>

      {dialog === 'view-as' ? (
        <OpenViewAsDialog
          storeId={store.id}
          storeName={name}
          hasOpen={Boolean(viewState.data?.active)}
          onClose={() => setDialog(null)}
          onOpened={async () => {
            setDialog(null);
            await client.invalidateQueries({ queryKey: viewAsKeys.state });
            router.push(asRoute(`/admin/lojas/${store.id}/ver-como?aba=ped`));
          }}
        />
      ) : null}
      {dialog === 'edit' && data ? <EditProfileDialog storeId={store.id} version={data.store.version} store={data.store} onDone={done} onReload={reload} onClose={() => setDialog(null)} /> : null}
      {dialog === 'pause' && data ? <PauseDialog storeId={store.id} version={data.store.version} storeName={name} onDone={done} onReload={reload} onClose={() => setDialog(null)} /> : null}
      {dialog === 'resume' && data ? <ResumeDialog storeId={store.id} version={data.store.version} storeName={name} onDone={done} onReload={reload} onClose={() => setDialog(null)} /> : null}
      {dialog === 'suspend' ? (
        <ReasonDialog
          title={`Suspender ${name}?`}
          description="A loja some do app agora e não recebe novos pedidos. O lojista é avisado."
          quickReasons={[...SUSPEND_REASONS]}
          confirmLabel="Suspender loja"
          destructive
          minReason={5}
          onConfirm={async (reason) => {
            await adminStoresApi.suspend(store.id, reason);
            await done(`${name} suspensa.`);
          }}
          onClose={() => setDialog(null)}
          testIds={{ dialog: T('suspend-dialog'), reason: T('suspend-reason'), confirm: T('suspend-confirm') }}
        />
      ) : null}
      {dialog === 'reactivate' ? (
        <Dialog
          title={`Reativar ${name}?`}
          onClose={() => setDialog(null)}
          testId={T('reactivate-dialog')}
          locked={reactivating}
          actions={
            <>
              <Button onClick={() => void reactivate()} loading={reactivating} loadingLabel="Reativando…" data-testid={T('reactivate-confirm')}>Reativar loja</Button>
              <Button variant="text" onClick={() => setDialog(null)} disabled={reactivating}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Ela volta ao app se continuar atendendo as regras de visibilidade.</p>
          {reactivateError ? <Banner tone="danger">{reactivateError}</Banner> : null}
        </Dialog>
      ) : null}
    </div>
  );
}
