'use client';

import { Prohibit, LockOpen } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, ErrorState, NoAccessState, SkeletonRows, cx, useToast } from '@/components/ui';
import { MODE_LABEL, adminOpsApi, adminOpsKeys, ADMIN_ORDER_STATUS_LABEL, type AdminUserBlockResult, type AdminUserDetail } from '@/lib/api/admin-ops';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatCents, formatDateTime, formatFullDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { BackLink, useIsOffline } from './common';
import s from './ops.module.css';
import { ROLE_LABEL, USER_STATUS_LABEL } from './users-page';

const T = (id: string) => tid('usuarios', id);
const STORE_STATUS_LABEL: Record<string, string> = { draft: 'Cadastro em andamento', in_review: 'Em análise', correction_requested: 'Aguardando lojista', approved: 'Aprovada', rejected: 'Recusada', suspended: 'Suspensa' };

export function userActionError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para continuar. Nada foi alterado.';
    if (caught.code === 'USER_ALREADY_BLOCKED') return 'Esta conta já está bloqueada. Atualizamos a tela.';
    if (caught.code === 'USER_NOT_BLOCKED') return 'Esta conta já foi desbloqueada. Atualizamos a tela.';
    if (caught.code === 'USER_NOT_ACTIVE') return 'Conta excluída não pode ser bloqueada.';
    if (caught.status === 404) return 'Não encontramos essa conta.';
    if (caught.status === 403) return 'Seu perfil não pode bloquear nem desbloquear contas.';
  }
  return saveErrorMessage(caught, 'Não foi possível salvar. Nada foi alterado. Tente de novo.');
}

/** Lojas que ficam suspensas junto com o bloqueio: as aprovadas em que a pessoa é dona (WB-102 C5). */
export function storesToSuspend(user: Pick<AdminUserDetail, 'stores'>): AdminUserDetail['stores'] {
  return user.stores.filter((store) => store.role === 'owner' && store.status === 'approved');
}

/** B4, WB-102 C2/C3/C5: detalhe mascarado, lojas, pedidos recentes, histórico de bloqueios; bloquear e desbloquear com motivo e o efeito dito antes. */
export function UserDetailPage({ id }: { id: string }) {
  const { canView } = useSession();
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const [action, setAction] = useState<'block' | 'unblock' | null>(null);
  const [result, setResult] = useState<AdminUserBlockResult | null>(null);
  const allowed = canView('usuarios');
  const query = useQuery({ queryKey: adminOpsKeys.user(id), queryFn: () => adminOpsApi.user(id), enabled: allowed });
  const offline = useIsOffline(query.error);
  if (!allowed) return <NoAccessState />;

  const back = <BackLink href="/admin/usuarios">Voltar aos usuários</BackLink>;
  if (query.isPending) return <SkeletonRows rows={4} height={110} label="Carregando o usuário" />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <div className={s.page}>{back}<p className="wb-text-body" role="alert" data-testid={T('not-found')}>Não encontramos essa conta.</p></div>;
    return <ErrorState offline={offline} onRetry={() => void query.refetch()} testId={T('detail-error')} />;
  }
  const user = query.data;
  if (!user) return null;
  const suspending = storesToSuspend(user);
  const canBlock = user.allowedActions.includes('block');
  const canUnblock = user.allowedActions.includes('unblock');
  const blockedStores = user.stores.filter((store) => store.role === 'owner' && store.status === 'suspended');

  return (
    <div className={s.page}>
      {back}
      <PageHeader title={user.name} description={`Cadastro em ${formatFullDateTime(user.createdAt)}`} action={<span className={s.actions}>{user.roles.map((r) => <Badge key={r} tone="neutral">{ROLE_LABEL[r]}</Badge>)}<Badge tone={user.status === 'active' ? 'success' : user.status === 'blocked' ? 'danger' : 'neutral'} testId={T('detail-status')}>{USER_STATUS_LABEL[user.status]}</Badge></span>} />
      {result && result.failedStoreIds.length > 0 ? (
        <Banner tone="warning" testId={T('failed-stores')}>
          A conta foi bloqueada, mas não conseguimos suspender {result.failedStoreIds.length === 1 ? 'uma loja' : `${result.failedStoreIds.length} lojas`} dela. Suspenda em Lojas para a loja parar de vender.
        </Banner>
      ) : null}
      {result && result.suspendedStoreIds.length > 0 ? (
        <Banner tone="info" testId={T('suspended-stores')}>{result.suspendedStoreIds.length === 1 ? 'A loja do dono foi suspensa junto.' : `${result.suspendedStoreIds.length} lojas do dono foram suspensas junto.`}</Banner>
      ) : null}
      {user.status === 'blocked' && blockedStores.length > 0 ? (
        <Banner tone="warning" testId={T('stores-stay-suspended')}>Desbloquear a conta não reativa a loja. {blockedStores.length === 1 ? 'A loja' : 'As lojas'} continua(m) suspensa(s) até alguém reativar em Lojas.</Banner>
      ) : null}

      <div className={s.blocks}>
        <section className={s.block} aria-labelledby="us-data" data-testid={T('detail-data')}>
          <h2 id="us-data" className="wb-text-title2">Dados da conta</h2>
          <dl className={cx('wb-text-body', s.kv)}>
            <dt>E-mail</dt><dd data-testid={T('email')}>{user.emailMasked ?? '-'}</dd>
            <dt>E-mail verificado</dt><dd>{user.emailVerified ? 'Sim' : 'Não'}</dd>
            <dt>Celular</dt><dd data-testid={T('phone')}>{user.phoneMasked ?? '-'}</dd>
            <dt>Situação</dt><dd>{USER_STATUS_LABEL[user.status]}</dd>
            <dt>Último acesso</dt><dd>{user.lastLoginAt ? formatFullDateTime(user.lastLoginAt) : 'Nunca entrou'}</dd>
          </dl>
          <p className={cx('wb-text-caption', s.muted)}>O e-mail e o celular completos não aparecem nesta tela.</p>
          {canBlock ? <div><Button variant="destructive" icon={<Prohibit size={20} aria-hidden="true" />} onClick={() => setAction('block')} disabled={!online} data-testid={T('block')}>Bloquear conta</Button></div> : null}
          {canUnblock ? <div><Button variant="secondary" icon={<LockOpen size={20} aria-hidden="true" />} onClick={() => setAction('unblock')} disabled={!online} data-testid={T('unblock')}>Desbloquear conta</Button></div> : null}
          {!canBlock && !canUnblock && user.status !== 'deleted' ? <p className={cx('wb-text-caption', s.muted)} data-testid={T('read-only')}>Seu perfil só consulta contas. Peça à operação ou a um super admin para bloquear.</p> : null}
          {user.status === 'deleted' ? <p className={cx('wb-text-caption', s.muted)}>Conta excluída: não há ação possível.</p> : null}
        </section>

        <section className={s.block} aria-labelledby="us-stores" data-testid={T('detail-stores')}>
          <h2 id="us-stores" className="wb-text-title2">Lojas vinculadas</h2>
          {user.stores.length === 0 ? (
            <p className={cx('wb-text-body', s.muted)}>Nenhuma loja vinculada.</p>
          ) : (
            <ul className={s.list}>
              {user.stores.map((store) => (
                <li key={store.id} className={s.cardTop}>
                  {canView('lojas') ? <Link href={asRoute(`/admin/lojas/${store.id}`)} className={cx('wb-text-body-strong', s.titleLink)}>{store.name ?? 'Loja sem nome'}</Link> : <span className="wb-text-body-strong">{store.name ?? 'Loja sem nome'}</span>}
                  <span className={cx('wb-text-caption', s.muted)}>{store.role === 'owner' ? 'Dono' : 'Equipe'} · {STORE_STATUS_LABEL[store.status] ?? store.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={s.block} aria-labelledby="us-orders" data-testid={T('detail-orders')}>
        <h2 id="us-orders" className="wb-text-title2">Pedidos recentes</h2>
        {user.recentOrders.length === 0 ? (
          <p className={cx('wb-text-body', s.muted)}>Esta conta ainda não fez pedidos.</p>
        ) : (
          <ul className={s.list}>
            {user.recentOrders.map((order) => (
              <li key={order.id} className={s.cardTop}>
                {canView('pedidos') ? <Link href={asRoute(`/admin/pedidos/${order.id}`)} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T(`order-${order.id}`)}>#{order.number}</Link> : <span className="wb-text-body-strong">#{order.number}</span>}
                <span className={cx('wb-text-caption', s.muted)}>{order.storeName ?? 'Loja'} · {MODE_LABEL[order.mode]} · {ADMIN_ORDER_STATUS_LABEL[order.status as keyof typeof ADMIN_ORDER_STATUS_LABEL] ?? order.status} · {formatCents(order.total.amount)} · {formatDateTime(order.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {canView('pedidos') && user.recentOrders.length > 0 ? <Link href={asRoute(`/admin/pedidos?userId=${user.id}`)} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T('all-orders')}>Ver todos os pedidos desta conta</Link> : null}
      </section>

      <section className={s.block} aria-labelledby="us-hist" data-testid={T('history')}>
        <h2 id="us-hist" className="wb-text-title2">Histórico de bloqueios</h2>
        {user.blockHistory.length === 0 ? (
          <p className={cx('wb-text-body', s.muted)}>Esta conta nunca foi bloqueada.</p>
        ) : (
          <ol className={s.timeline}>
            {user.blockHistory.map((entry, index) => (
              <li key={index} className="wb-text-body">
                <strong>{entry.action === 'blocked' ? 'Bloqueada' : 'Desbloqueada'}</strong> em {formatFullDateTime(entry.at)} por {entry.byName ?? 'sistema'}. Motivo: {entry.reason}
                {entry.suspendedStoreIds.length > 0 ? ` (${entry.suspendedStoreIds.length} ${entry.suspendedStoreIds.length === 1 ? 'loja suspensa' : 'lojas suspensas'})` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>

      {action === 'block' ? (
        <ReasonDialog
          title={`Bloquear a conta de ${user.name}?`}
          description={
            <>
              <p style={{ margin: 0 }}>O que acontece ao confirmar:</p>
              <ul className={s.effects} data-testid={T('block-effects')}>
                <li>A pessoa sai de todos os aparelhos agora e passa a ver “Conta indisponível” ao tentar entrar.</li>
                {suspending.length > 0 ? <li>{suspending.length === 1 ? `A loja ${suspending[0]?.name ?? ''} é suspensa junto` : `As lojas ${suspending.map((store) => store.name ?? 'sem nome').join(', ')} são suspensas junto`}: deixa de vender na hora.</li> : null}
                <li>Pedidos em andamento não são cancelados. Eles seguem para a sua decisão em Pedidos.</li>
                <li>O motivo é interno: fica na auditoria e no histórico da conta e o dono da loja não o vê. Não escreva dado pessoal do cliente nele.</li>
              </ul>
            </>
          }
          confirmLabel="Bloquear conta"
          destructive
          maxReason={300}
          testIds={{ dialog: T('block-dialog'), reason: T('block-reason'), confirm: T('block-confirm') }}
          onConfirm={async (reason) => {
            try {
              const done = await adminOpsApi.blockUser(user.id, reason);
              setResult(done);
            } catch (caught) {
              if (caught instanceof ApiError && caught.status === 409) void client.invalidateQueries({ queryKey: adminOpsKeys.users });
              throw new UserMessageError(userActionError(caught));
            }
            await client.invalidateQueries({ queryKey: adminOpsKeys.users });
            toast.show('Conta bloqueada. Registrado na auditoria.');
          }}
          onClose={() => setAction(null)}
        />
      ) : null}
      {action === 'unblock' ? (
        <ReasonDialog
          title={`Desbloquear a conta de ${user.name}?`}
          description={
            <>
              <p style={{ margin: 0 }}>O que acontece ao confirmar:</p>
              <ul className={s.effects} data-testid={T('unblock-effects')}>
                <li>A pessoa volta a poder entrar e usar o app.</li>
                <li>Lojas suspensas pelo bloqueio não são reativadas sozinhas. Reative em Lojas, se for o caso.</li>
                <li>O motivo é interno: fica na auditoria e no histórico da conta. Não escreva dado pessoal nele.</li>
              </ul>
            </>
          }
          confirmLabel="Desbloquear conta"
          maxReason={300}
          testIds={{ dialog: T('unblock-dialog'), reason: T('unblock-reason'), confirm: T('unblock-confirm') }}
          onConfirm={async (reason) => {
            try {
              await adminOpsApi.unblockUser(user.id, reason);
            } catch (caught) {
              if (caught instanceof ApiError && caught.status === 409) void client.invalidateQueries({ queryKey: adminOpsKeys.users });
              throw new UserMessageError(userActionError(caught));
            }
            setResult(null);
            await client.invalidateQueries({ queryKey: adminOpsKeys.users });
            toast.show('Conta desbloqueada. Registrado na auditoria.');
          }}
          onClose={() => setAction(null)}
        />
      ) : null}
    </div>
  );
}
