'use client';

import { Prohibit, ArrowUUpLeft } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useReauth } from '@/components/panel/reauth';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, CheckboxField, ErrorState, NoAccessState, SkeletonRows, TextField, cx, useToast } from '@/components/ui';
import { OrderStatusBadge, ModeBadge } from '@/features/orders/status-badge';
import { ACTOR_LABEL, ADMIN_ORDER_STATUS_LABEL, ORDER_TERMINAL, PAYMENT_LABEL, adminOpsApi, adminOpsKeys, type AdminOrderDetail } from '@/lib/api/admin-ops';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatCents, formatFullDateTime } from '@/lib/format';
import { centsInput, parseCents } from '@/lib/money';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { BackLink, useIsOffline } from './common';
import s from './ops.module.css';

const T = (id: string) => tid('pedidos', id);

const REFUND_STATUS_LABEL = { pending: 'Na fila para tentar de novo', done: 'Concluído', failed: 'Falhou', exhausted: 'Esgotado: precisa de ação', covered: 'Coberto pela Webag' } as const;
const PAYMENT_STATUS_LABEL: Record<string, string> = { pending: 'Aguardando', approved: 'Aprovado', paid: 'Pago', declined: 'Recusado', rejected: 'Recusado', cancelled: 'Cancelado', expired: 'Vencido', refunded: 'Estornado' };

/** Texto do erro de cancelar e estornar, por código estável da API. */
export function orderActionError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para continuar. Nada foi alterado.';
    if (caught.code === 'REAUTH_CANCELLED') return 'Confirmação cancelada. Nada foi alterado.';
    if (caught.code === 'SUPER_ADMIN_REQUIRED') return 'Este valor passa do limite do seu perfil. Peça aprovação a um super admin.';
    if (caught.code === 'ORDER_NOT_CANCELLABLE') return 'Este pedido não pode mais ser cancelado. Atualizamos a tela.';
    if (caught.code === 'REFUND_EXCEEDS_PAID') return 'O valor passa do que resta a estornar. Atualizamos a tela.';
    if (caught.code === 'IDEMPOTENCY_KEY_REUSED') return 'Esta confirmação já foi usada com outro valor. Feche e abra de novo.';
    if (caught.status === 403) return 'Seu perfil não pode cancelar nem estornar pedidos.';
    if (caught.status === 404) return 'Não encontramos esse pedido.';
    if (caught.status === 409) return 'O pedido mudou enquanto você confirmava. Atualizamos a tela, confira e tente de novo.';
  }
  return saveErrorMessage(caught, 'Não foi possível concluir. Nada foi alterado. Tente de novo.');
}

/** Cancelar com estorno acima do limite só o super admin faz (WB-109 C3). */
export function needsSuperAdmin(cents: number, limit: AdminOrderDetail['refundLimit'], isSuper: boolean): boolean {
  return !isSuper && cents > limit.superAdminOnlyAboveCents;
}

function Money({ cents }: { cents: number }) {
  return <>{formatCents(cents)}</>;
}

/** B5, WB-108 C2 e WB-109: o pedido por inteiro (mascarado) e as intervenções que o perfil pode fazer, segundo `allowedActions`. */
export function AdminOrderDetailPage({ id }: { id: string }) {
  const { canView, user } = useSession();
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const reauth = useReauth();
  const [action, setAction] = useState<'cancel' | 'refund' | null>(null);
  const allowed = canView('pedidos');
  const query = useQuery({ queryKey: adminOpsKeys.order(id), queryFn: () => adminOpsApi.order(id), enabled: allowed });
  const offline = useIsOffline(query.error);
  if (!allowed) return <NoAccessState />;

  const back = <BackLink href="/admin/pedidos">Voltar aos pedidos</BackLink>;
  if (query.isPending) return <SkeletonRows rows={4} height={110} label="Carregando o pedido" />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <div className={s.page}>{back}<p className="wb-text-body" role="alert" data-testid={T('not-found')}>Não encontramos esse pedido.</p></div>;
    return <ErrorState offline={offline} onRetry={() => void query.refetch()} testId={T('detail-error')} />;
  }
  const order = query.data;
  if (!order) return null;

  const isSuper = user.adminProfile === 'super_admin';
  const canCancel = order.allowedActions.includes('cancel');
  const canRefund = order.allowedActions.includes('refund');
  const terminal = ORDER_TERMINAL.includes(order.status);
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: adminOpsKeys.orders }), client.invalidateQueries({ queryKey: ['admin', 'refund-queue'] })]);

  return (
    <div className={s.page}>
      {back}
      <PageHeader title={`Pedido #${order.number}`} description={`${order.store.name}${order.store.city ? ` · ${order.store.city}` : ''}`} action={<span className={s.actions}><OrderStatusBadge status={order.status} testId={T('status')} /><ModeBadge mode={order.mode} /></span>} />
      {order.disputedAt ? <Banner tone="danger" testId={T('disputed')}>O pagamento foi contestado pelo provedor (chargeback) em {formatFullDateTime(order.disputedAt)}. Não dá para estornar por aqui.</Banner> : null}
      {order.notReceivedAt ? <Banner tone="warning" testId={T('not-received')}>O cliente avisou que não recebeu o pedido em {formatFullDateTime(order.notReceivedAt)}.</Banner> : null}
      {order.status === 'cancelled' && order.cancelReason ? <Banner tone="info" testId={T('cancel-info')}>Cancelado {order.cancelledBy ? `por ${ACTOR_LABEL[order.cancelledBy].toLowerCase()}` : ''}{order.cancelledAt ? ` em ${formatFullDateTime(order.cancelledAt)}` : ''}. Motivo: {order.cancelReason}</Banner> : null}

      <section className={s.block} aria-labelledby="od-act" data-testid={T('actions')}>
        <h2 id="od-act" className="wb-text-title2">Intervir no pedido</h2>
        {canCancel || canRefund ? (
          <div className={s.actions}>
            {canCancel ? <Button variant="destructive" icon={<Prohibit size={20} aria-hidden="true" />} onClick={() => setAction('cancel')} disabled={!online} data-testid={T('cancel')}>Cancelar pedido</Button> : null}
            {canRefund ? <Button variant="secondary" icon={<ArrowUUpLeft size={20} aria-hidden="true" />} onClick={() => setAction('refund')} disabled={!online} data-testid={T('refund')}>Estornar valor</Button> : null}
          </div>
        ) : (
          <p className={cx('wb-text-body', s.muted)} data-testid={T('no-actions')}>
            {user.adminProfile === 'operations' || user.adminProfile === 'support'
              ? 'Seu perfil consulta pedidos. Cancelar e estornar são do financeiro e do super admin: peça a um deles.'
              : order.disputedAt
                ? 'Pedido com pagamento contestado: não há ação por aqui.'
                : terminal && order.refunds.remaining.amount === 0
                  ? 'Pedido encerrado e sem valor a estornar.'
                  : 'Nenhuma ação disponível para este pedido no momento.'}
          </p>
        )}
        {order.refundLimit.superAdminOnlyAboveCents > 0 ? <p className={cx('wb-text-caption', s.muted)}>Acima de {formatCents(order.refundLimit.superAdminOnlyAboveCents)} só um super admin cancela com estorno ou estorna.</p> : null}
      </section>

      <div className={s.blocks}>
        <section className={s.block} aria-labelledby="od-sum" data-testid={T('summary')}>
          <h2 id="od-sum" className="wb-text-title2">Resumo</h2>
          <dl className={cx('wb-text-body', s.kv)}>
            <dt>Loja</dt><dd>{canView('lojas') ? <Link href={asRoute(`/admin/lojas/${order.store.id}`)} className="wb-text-body-strong">{order.store.name}</Link> : order.store.name}</dd>
            <dt>Cliente</dt><dd data-testid={T('customer')}>{canView('usuarios') ? <Link href={asRoute(`/admin/usuarios/${order.customer.id}`)} className="wb-text-body-strong">{order.customer.name}</Link> : order.customer.name}</dd>
            <dt>E-mail</dt><dd data-testid={T('email')}>{order.customer.emailMasked ?? '-'}</dd>
            <dt>Celular</dt><dd data-testid={T('phone')}>{order.customer.phoneMasked ?? '-'}</dd>
            <dt>Criado em</dt><dd>{formatFullDateTime(order.createdAt)}</dd>
            <dt>Pago em</dt><dd>{order.paidAt ? formatFullDateTime(order.paidAt) : 'Ainda não pago'}</dd>
            {order.acceptedAt ? <><dt>Aceito em</dt><dd>{formatFullDateTime(order.acceptedAt)}</dd></> : null}
            {order.deliveredAt ? <><dt>Entregue em</dt><dd>{formatFullDateTime(order.deliveredAt)}</dd></> : null}
            {order.couponCode ? <><dt>Cupom</dt><dd>{order.couponCode}</dd></> : null}
          </dl>
        </section>

        <section className={s.block} aria-labelledby="od-del" data-testid={T('delivery')}>
          <h2 id="od-del" className="wb-text-title2">{order.mode === 'delivery' ? 'Entrega' : 'Retirada'}</h2>
          {order.delivery ? (
            <dl className={cx('wb-text-body', s.kv)}>
              <dt>Destino</dt><dd>{[order.delivery.neighborhood, order.delivery.city, order.delivery.state].filter(Boolean).join(', ') || '-'}</dd>
              <dt>Corrida</dt><dd>{order.delivery.logistics ? DELIVERY_LABEL[order.delivery.logistics.status] : 'Sem corrida (a loja entrega ou ainda não está pronta)'}</dd>
            </dl>
          ) : (
            <p className={cx('wb-text-body', s.muted)}>O cliente retira na loja.</p>
          )}
          <p className={cx('wb-text-caption', s.muted)}>O endereço completo não aparece aqui. Só o bairro, a cidade e o estado.</p>
          {order.delivery?.logistics && canView('logistica') ? <Link href={asRoute('/admin/logistica')} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T('see-logistics')}>Ver na Logística</Link> : null}
        </section>

        <section className={s.block} aria-labelledby="od-val" data-testid={T('values')}>
          <h2 id="od-val" className="wb-text-title2">Valores</h2>
          <dl className={cx('wb-text-body', s.kv)}>
            <dt>Itens</dt><dd><Money cents={order.values.subtotal.amount} /></dd>
            <dt>Entrega</dt><dd><Money cents={order.values.delivery.amount} /></dd>
            <dt>Taxa de serviço</dt><dd><Money cents={order.values.serviceFee.amount} /></dd>
            {order.values.storeDiscount.amount > 0 ? <><dt>Desconto da loja</dt><dd>-<Money cents={order.values.storeDiscount.amount} /></dd></> : null}
            {order.values.platformDiscount.amount > 0 ? <><dt>Desconto da Webag</dt><dd>-<Money cents={order.values.platformDiscount.amount} /></dd></> : null}
            <dt><strong>Total pago pelo cliente</strong></dt><dd data-testid={T('total')}><strong><Money cents={order.values.total.amount} /></strong></dd>
            <dt>Comissão da Webag</dt><dd><Money cents={order.values.commission.amount} /></dd>
            <dt>Taxa de aplicação</dt><dd><Money cents={order.values.applicationFee.amount} /></dd>
            <dt>Líquido da loja antes da taxa do provedor</dt><dd><Money cents={order.values.merchantNetBeforeProviderFee.amount} /></dd>
          </dl>
        </section>

        <section className={s.block} aria-labelledby="od-pay" data-testid={T('payment')}>
          <h2 id="od-pay" className="wb-text-title2">Pagamento e estornos</h2>
          {order.payment ? (
            <dl className={cx('wb-text-body', s.kv)}>
              <dt>Meio</dt><dd>{PAYMENT_LABEL[order.payment.method]}{order.payment.installments > 1 ? ` em ${order.payment.installments}x` : ''}</dd>
              <dt>Situação</dt><dd>{PAYMENT_STATUS_LABEL[order.payment.status] ?? order.payment.status}</dd>
              {order.payment.declineReason ? <><dt>Motivo da recusa</dt><dd>{order.payment.declineReason}</dd></> : null}
              <dt>Tentativas</dt><dd>{order.payment.attempts.length}</dd>
            </dl>
          ) : (
            <p className={cx('wb-text-body', s.muted)}>Sem tentativa de pagamento.</p>
          )}
          <dl className={cx('wb-text-body', s.kv)} data-testid={T('refund-totals')}>
            <dt>Pago</dt><dd><Money cents={order.refunds.paid.amount} /></dd>
            <dt>Já estornado ou na fila</dt><dd><Money cents={order.refunds.refunded.amount} /></dd>
            <dt>Resta estornar</dt><dd><Money cents={order.refunds.remaining.amount} /></dd>
          </dl>
          {order.refunds.items.length > 0 ? (
            <ul className={s.timeline} aria-label="Estornos do pedido">
              {order.refunds.items.map((refund) => (
                <li key={refund.id} className="wb-text-body">{formatCents(refund.amount.amount)} · {REFUND_STATUS_LABEL[refund.status]} · {formatFullDateTime(refund.at)}. {refund.reason}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section className={s.block} aria-labelledby="od-items" data-testid={T('items')}>
        <h2 id="od-items" className="wb-text-title2">Itens</h2>
        <ul className={s.timeline}>
          {order.items.map((item, index) => {
            const attrs = Object.entries(item.attributes).map(([k, v]) => `${k}: ${v}`).join(', ');
            return <li key={index} className="wb-text-body">{item.quantity} x {item.name}{attrs ? ` (${attrs})` : ''} · {formatCents(item.unitPrice.amount)} cada · {formatCents(item.lineTotal.amount)}</li>;
          })}
        </ul>
      </section>

      <section className={s.block} aria-labelledby="od-tl" data-testid={T('timeline')}>
        <h2 id="od-tl" className="wb-text-title2">Linha do tempo</h2>
        <ol className={s.timeline}>
          {order.timeline.map((entry, index) => (
            <li key={index} className="wb-text-body">
              {formatFullDateTime(entry.at)} · {ADMIN_ORDER_STATUS_LABEL[entry.status]} · {ACTOR_LABEL[entry.actor]}{entry.actorName ? ` (${entry.actorName})` : ''}
              {entry.reason ? `. Motivo: ${entry.reason}` : ''}
            </li>
          ))}
        </ol>
      </section>

      {order.exchanges.length > 0 || order.review ? (
        <section className={s.block} aria-labelledby="od-more" data-testid={T('after-sale')}>
          <h2 id="od-more" className="wb-text-title2">Pós-venda</h2>
          {order.exchanges.map((exchange) => (
            <p key={exchange.id} className="wb-text-body" style={{ margin: 0 }}>
              {canView('disputas') ? <Link href={asRoute(`/admin/disputas/${exchange.id}`)} className="wb-text-body-strong">Troca {exchange.number}</Link> : `Troca ${exchange.number}`} · {exchange.status}
            </p>
          ))}
          {order.review ? <p className="wb-text-body" style={{ margin: 0 }}>Avaliação do cliente: {order.review.rating} de 5.</p> : null}
        </section>
      ) : null}

      {action === 'cancel' ? (
        <CancelDialog
          order={order}
          isSuper={isSuper}
          onClose={() => setAction(null)}
          onConfirm={async (reason, refund) => {
            try {
              await reauth.guard(() => adminOpsApi.cancelOrder(order.id, { reason, refund }), 'Cancelar um pedido pode devolver dinheiro ao cliente. Confirme com o código do app autenticador.');
            } catch (caught) {
              if (caught instanceof ApiError && caught.status === 409) void refresh();
              throw new UserMessageError(orderActionError(caught));
            }
            await refresh();
            toast.show(refund ? 'Pedido cancelado e estornado. Cliente e loja foram avisados.' : 'Pedido cancelado sem estorno. Cliente e loja foram avisados.');
          }}
        />
      ) : null}
      {action === 'refund' ? (
        <RefundDialog
          order={order}
          isSuper={isSuper}
          onClose={() => setAction(null)}
          onConfirm={async (amountCents, reason, key) => {
            let status: 'done' | 'queued';
            try {
              status = (await reauth.guard(() => adminOpsApi.refundOrder(order.id, { amountCents, reason }, key), 'Estornar devolve dinheiro ao cliente. Confirme com o código do app autenticador.')).status;
            } catch (caught) {
              if (caught instanceof ApiError && (caught.status === 409 || caught.status === 422)) void refresh();
              throw new UserMessageError(orderActionError(caught));
            }
            await refresh();
            toast.show(status === 'done' ? `Estorno de ${formatCents(amountCents)} concluído. O cliente foi avisado.` : 'O Mercado Pago não aceitou agora. O estorno ficou na fila e será tentado de novo.');
          }}
        />
      ) : null}
    </div>
  );
}

const DELIVERY_LABEL = {
  ready_for_collection: 'Pronta para coleta',
  awaiting_courier: 'Esperando motoboy',
  courier_en_route: 'Motoboy a caminho da loja',
  out_for_delivery: 'Em rota de entrega',
  delivered: 'Entregue',
  not_delivered: 'Não entregue',
  returned_to_store: 'Devolvida à loja',
  cancelled: 'Cancelada',
} as const;

function CancelDialog({ order, isSuper, onConfirm, onClose }: { order: AdminOrderDetail; isSuper: boolean; onConfirm: (reason: string, refund: boolean) => Promise<void>; onClose: () => void }) {
  const [refund, setRefund] = useState(true);
  const remaining = order.refunds.remaining.amount;
  const blocked = refund && needsSuperAdmin(remaining, order.refundLimit, isSuper);
  return (
    <ReasonDialog
      title={`Cancelar o pedido #${order.number}?`}
      description={
        <>
          <p style={{ margin: 0 }}>O que acontece ao confirmar:</p>
          <ul className={s.effects} data-testid={T('cancel-effects')}>
            <li>O pedido vai para “Cancelado” e não volta atrás.</li>
            <li>O estoque dos itens é devolvido{order.delivery?.logistics ? ' e a corrida em aberto é cancelada' : ''}.</li>
            <li>O cliente e a loja são avisados.</li>
            <li>O motivo fica no histórico do pedido e na auditoria.</li>
          </ul>
        </>
      }
      confirmLabel="Cancelar pedido"
      destructive
      maxReason={300}
      extra={
        remaining > 0 ? (
          <CheckboxField label={`Estornar ${formatCents(remaining)} ao cliente agora`} checked={refund} onChange={(e) => setRefund(e.target.checked)} data-testid={T('cancel-refund')} />
        ) : (
          <p className="wb-text-caption" style={{ margin: 0 }}>Não há valor a estornar neste pedido.</p>
        )
      }
      warning={blocked ? <Banner tone="warning" testId={T('cancel-limit')}>Estornar {formatCents(remaining)} passa de {formatCents(order.refundLimit.superAdminOnlyAboveCents)}. Peça aprovação a um super admin, ou desmarque o estorno e faça-o depois.</Banner> : undefined}
      precheck={() => (blocked ? 'Desmarque o estorno ou peça aprovação a um super admin.' : null)}
      testIds={{ dialog: T('cancel-dialog'), reason: T('cancel-reason'), confirm: T('cancel-confirm') }}
      onConfirm={(reason) => onConfirm(reason, remaining > 0 && refund)}
      onClose={onClose}
    />
  );
}

function RefundDialog({ order, isSuper, onConfirm, onClose }: { order: AdminOrderDetail; isSuper: boolean; onConfirm: (amountCents: number, reason: string, key: string) => Promise<void>; onClose: () => void }) {
  const remaining = order.refunds.remaining.amount;
  const [amount, setAmount] = useState(centsInput(remaining));
  const [touched, setTouched] = useState(false);
  // A mesma chave vale para a tentativa e a repetição após a reautenticação; abrir de novo gera outra.
  const [key] = useState(() => `refund-${crypto.randomUUID()}`);
  const cents = parseCents(amount);
  const error = cents === null || cents <= 0 ? 'Informe um valor maior que zero.' : cents > remaining ? `O máximo é ${formatCents(remaining)}.` : needsSuperAdmin(cents, order.refundLimit, isSuper) ? `Acima de ${formatCents(order.refundLimit.superAdminOnlyAboveCents)} só um super admin estorna. Peça aprovação.` : undefined;
  return (
    <ReasonDialog
      title={`Estornar o pedido #${order.number}?`}
      description={
        <>
          <p style={{ margin: 0 }}>O valor volta ao cliente pelo Mercado Pago. Um estorno que zera o pedido o leva a “Cancelado”.</p>
          <ul className={s.effects} data-testid={T('refund-effects')}>
            <li>Pago: {formatCents(order.refunds.paid.amount)}. Já estornado ou na fila: {formatCents(order.refunds.refunded.amount)}.</li>
            <li>Resta estornar: {formatCents(remaining)}.</li>
            <li>O cliente é avisado e o motivo vai para a auditoria.</li>
          </ul>
        </>
      }
      confirmLabel="Estornar"
      destructive
      maxReason={300}
      extra={<TextField label="Valor a estornar (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.slice(0, 14))} error={touched ? error : undefined} autoComplete="off" data-testid={T('refund-amount')} />}
      precheck={() => {
        setTouched(true);
        return error ?? null;
      }}
      testIds={{ dialog: T('refund-dialog'), reason: T('refund-reason'), confirm: T('refund-confirm') }}
      onConfirm={(reason) => onConfirm(cents ?? 0, reason, key)}
      onClose={onClose}
    />
  );
}
