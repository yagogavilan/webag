'use client';

import { CurrencyCircleDollar } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useReauth } from '@/components/panel/reauth';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, EmptyState, ErrorState, NoAccessState, SkeletonRows, Tabs, useToast } from '@/components/ui';
import { adminFinanceApi, financeAdminKeys, type RefundQueueItem } from '@/lib/api/admin-finance';
import { ApiError } from '@/lib/api/errors';
import { formatCents, formatDateTime } from '@/lib/format';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './admin-finance.module.css';

const T = (id: string) => tid('estornos', id);
type Filter = 'all' | RefundQueueItem['status'];
const STATUS: Record<RefundQueueItem['status'], { label: string; tone: 'warning' | 'danger' | 'success' }> = {
  pending: { label: 'Tentando de novo', tone: 'warning' },
  exhausted: { label: 'Esgotado', tone: 'danger' },
  covered: { label: 'Coberto pela Webag', tone: 'success' },
};

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'Conecte-se para continuar. Nada foi alterado.';
    if (error.code === 'COVERAGE_ABOVE_LIMIT') return 'Valor acima do teto de cobertura por pedido. Resolva por fora com o provedor.';
    if (error.code === 'REFUND_NOT_COVERABLE') return 'Só estorno esgotado pode ser coberto. Este ainda está em nova tentativa.';
    if (error.code === 'REFUND_IN_FLIGHT') return 'Há uma chamada ao provedor em andamento. Espere um minuto e tente de novo.';
    if (error.status === 403) return 'Seu perfil não pode fazer isso.';
  }
  return 'Não foi possível concluir. Nada foi alterado.';
}

/** Fila de estornos que o provedor recusou: tentar de novo e cobertura da Webag (só super admin, com teto e motivo). */
export function RefundQueuePage() {
  const { canView, canEdit, user } = useSession();
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const reauth = useReauth();
  const [filter, setFilter] = useState<Filter>('all');
  const [covering, setCovering] = useState<RefundQueueItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: financeAdminKeys.refunds(filter), queryFn: () => adminFinanceApi.refundQueue(filter === 'all' ? undefined : filter), enabled: canView('estornos'), refetchInterval: 60_000 });
  if (!canView('estornos')) return <NoAccessState />;
  const isSuper = user.adminProfile === 'super_admin';

  async function retry(item: RefundQueueItem) {
    setBusy(item.id);
    setError(null);
    try {
      const result = await reauth.guard(() => adminFinanceApi.retryRefund(item.id), 'Tentar o estorno de novo mexe com dinheiro. Confirme com o código do app autenticador.');
      toast.show(result.status === 'done' ? 'Estorno concluído.' : 'Tentamos de novo. O provedor ainda não aceitou.');
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(null);
      void client.invalidateQueries({ queryKey: ['admin', 'refund-queue'] });
    }
  }

  const rows = query.data?.data ?? [];
  return (
    <div className={s.page}>
      <PageHeader title="Estornos pendentes" description="Estornos que o Mercado Pago recusou. Cada um aparece até ser concluído ou coberto." />
      <Tabs
        label="Estado do estorno"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'all', label: 'Todos', testId: T('tab-all') },
          { id: 'pending', label: 'Tentando de novo', testId: T('tab-pending') },
          { id: 'exhausted', label: 'Esgotados', testId: T('tab-exhausted') },
          { id: 'covered', label: 'Cobertos', testId: T('tab-covered') },
        ]}
      />
      {error ? <Banner tone="danger" testId={T('error')}>{error}</Banner> : null}
      {query.isPending ? (
        <SkeletonRows rows={4} height={110} label="Carregando os estornos" />
      ) : query.isError && !query.data ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CurrencyCircleDollar} title="Nenhum estorno pendente" text="Quando o provedor recusar um estorno, ele aparece aqui." testId={T('empty')} />
      ) : (
        <ul className={s.list} aria-label="Estornos">
          {rows.map((item) => (
            <li key={item.id} className={s.card} data-testid={T(`row-${item.id}`)}>
              <div className={s.row}>
                <span className="wb-text-title2">{formatCents(item.amountCents)}</span>
                <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
              </div>
              <p className="wb-text-body" style={{ margin: 0 }}>{item.reason}</p>
              <p className={`wb-text-caption ${s.muted}`}>Pedido {item.orderReference.slice(0, 8)} · {item.failures} {item.failures === 1 ? 'falha' : 'falhas'}{item.lastErrorCode ? ` (${item.lastErrorCode})` : ''} · criado em {formatDateTime(item.createdAt)}{item.status === 'pending' ? ` · próxima tentativa ${formatDateTime(item.nextAttemptAt)}` : ''}</p>
              {item.status !== 'covered' && canEdit('estornos') ? (
                <div className={s.actions}>
                  <Button variant="secondary" onClick={() => void retry(item)} loading={busy === item.id} loadingLabel="Tentando…" disabled={!online} data-testid={T(`retry-${item.id}`)}>Tentar de novo agora</Button>
                  {isSuper && item.status === 'exhausted' ? <Button variant="destructive" onClick={() => setCovering(item)} disabled={!online} data-testid={T(`cover-${item.id}`)}>Cobrir pela Webag</Button> : null}
                </div>
              ) : null}
              {item.status === 'exhausted' && !isSuper ? <p className={`wb-text-caption ${s.muted}`}>Peça a um super admin para cobrir este estorno.</p> : null}
            </li>
          ))}
        </ul>
      )}
      {covering ? (
        <ReasonDialog
          title={`Cobrir ${formatCents(covering.amountCents)} pela Webag?`}
          description="A Webag assume o valor, até o teto de cobertura por pedido, e paga por fora. A parte da loja vira dívida no ledger. O estorno deixa de ser tentado no provedor."
          minReason={10}
          confirmLabel="Cobrir estorno"
          destructive
          onConfirm={async (reason) => {
            try {
              await reauth.guard(() => adminFinanceApi.coverRefund(covering.id, reason), 'Cobrir um estorno gasta dinheiro da Webag. Confirme com o código do app autenticador.');
            } catch (caught) {
              throw new UserMessageError(describe(caught));
            } finally {
              void client.invalidateQueries({ queryKey: ['admin', 'refund-queue'] });
            }
            toast.show('Estorno coberto. Registrado na auditoria.');
          }}
          onClose={() => setCovering(null)}
          testIds={{ dialog: T('cover-dialog'), reason: T('cover-reason'), confirm: T('cover-confirm') }}
        />
      ) : null}
    </div>
  );
}
