'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { ActionMenu, Badge, Banner, Button, Dialog, Tabs, TabPanel, cx, ui, useToast } from '@/components/ui';
import { canOpenStoreDocuments } from '@/lib/admin-access';
import { adminStoresApi, storeKeys, type AdminStoreDetail } from '@/lib/api/admin-stores';
import { formatDateTime } from '@/lib/format';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ACCESS_REASON_FOR, STATUS_LABEL, SUSPEND_REASONS } from './catalog';
import { DocumentViewer } from './doc-viewer';
import s from './stores.module.css';

const T = (id: string) => tid('loja', id);
type TabId = 'summary' | 'data' | 'documents' | 'history';

const TONE = { approved: 'success', live: 'success', suspended: 'danger', rejected: 'danger', correction_requested: 'warning', in_review: 'info', draft: 'neutral' } as const;

/** A3: loja já decidida. Suspender, reativar e consultar; edição como administrador entra com a configuração da loja (C2 a C5). */
export function StoreDetail({ detail }: { detail: AdminStoreDetail }) {
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const { user } = useSession();
  const { store } = detail;
  const name = store.name ?? 'a loja';
  const decide = user.adminProfile === 'super_admin' || user.adminProfile === 'operations';
  const canDocuments = canOpenStoreDocuments(user.adminProfile);
  const [tab, setTab] = useState<TabId>('summary');
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null);
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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'summary', label: 'Resumo' },
    { id: 'data', label: 'Dados' },
    ...(canDocuments ? [{ id: 'documents' as const, label: 'Documentos' }] : []),
    { id: 'history', label: 'Histórico' },
  ];
  const current = detail.documents.filter((doc) => doc.current);

  return (
    <div className={ui.stack}>
      <PageHeader
        title={store.name ?? 'Loja'}
        description={store.address?.city ? `${store.address.city} - ${store.address.state ?? ''}` : undefined}
        action={
          <span className={ui.row}>
            <Badge tone={TONE[store.status]} testId={T('status-badge')}>{STATUS_LABEL[store.status]}</Badge>
            {decide && store.status === 'suspended' ? (
              <Button onClick={() => setDialog('reactivate')} disabled={!online} data-testid={T('reactivate')}>Reativar loja</Button>
            ) : null}
            {decide && store.status === 'approved' ? (
              <ActionMenu label="Mais ações" testId={T('more-menu')} actions={[{ label: 'Suspender loja', danger: true, onSelect: () => setDialog('suspend'), testId: T('suspend') }]} />
            ) : null}
          </span>
        }
      />
      {!decide ? <Banner tone="info">Você pode ver esta loja, mas não alterá-la.</Banner> : null}
      {!online && decide ? <Banner tone="warning" offline>Conecte-se para alterar a loja.</Banner> : null}
      {store.status === 'suspended' && store.decisionReason ? <Banner tone="danger">Motivo da suspensão: {store.decisionReason}</Banner> : null}
      {store.status === 'rejected' && store.decisionReason ? <Banner tone="warning">Motivo da recusa: {store.decisionReason}</Banner> : null}
      {detail.sameDocument.length > 0 ? <Banner tone="warning">Há outra loja com o mesmo CPF/CNPJ.</Banner> : null}
      <Tabs label="Seções da loja" value={tab} onChange={setTab} tabs={tabs} />
      <TabPanel id={tab}>
        {tab === 'summary' ? (
          <dl className={s.dataList}>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Estado</dt>
            <dd>{STATUS_LABEL[store.status]}</dd>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Comissão</dt>
            <dd>Padrão da plataforma</dd>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Responsável</dt>
            <dd>{detail.owner.name}</dd>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Conta de recebimento</dt>
            <dd>{detail.paymentAccount ? (detail.paymentAccount.holderMatchesStore ? `Conectada, titular ${detail.paymentAccount.holderDocumentMasked}` : 'Titular diferente do cadastro') : 'Não conectada'}</dd>
          </dl>
        ) : null}
        {tab === 'data' ? (
          <dl className={s.dataList} data-testid={T('data')}>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Tipo</dt>
            <dd>{store.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}</dd>
            {store.legalName ? (
              <>
                <dt className={cx('wb-text-caption-strong', ui.muted)}>Razão social</dt>
                <dd>{store.legalName}</dd>
              </>
            ) : null}
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Endereço</dt>
            <dd>{store.address ? `${store.address.street ?? ''}, ${store.address.number ?? ''} - ${store.address.neighborhood ?? ''}, ${store.address.city ?? ''}/${store.address.state ?? ''}` : 'Sem endereço'}</dd>
            <dt className={cx('wb-text-caption-strong', ui.muted)}>Cadastro criado</dt>
            <dd>{formatDateTime(store.createdAt)}</dd>
          </dl>
        ) : null}
        {tab === 'documents' && canDocuments ? <DocumentViewer storeId={store.id} documents={current} reason={ACCESS_REASON_FOR.other} selectedId={selectedDoc} onSelect={setSelectedDoc} /> : null}
        {tab === 'history' ? (
          detail.history.length === 0 ? (
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
          )
        ) : null}
      </TabPanel>

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
