'use client';

import { CheckCircle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, ErrorState, NoAccessState, SkeletonRows, cx, useToast } from '@/components/ui';
import { ALERT_AREA_LABEL, adminOpsApi, adminOpsKeys } from '@/lib/api/admin-ops';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatFullDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { BackLink, SeverityBadge, techValue, useIsOffline } from './common';
import s from './ops.module.css';

const T = (id: string) => tid('alertas', id);

export function resolveError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para encerrar. Nada foi alterado.';
    if (caught.code === 'ALERT_ALREADY_RESOLVED') return 'Outra pessoa já encerrou este alerta. Atualizamos a tela.';
    if (caught.status === 404) return 'Este alerta não está mais disponível para o seu perfil.';
    if (caught.status === 403) return 'Seu perfil não pode encerrar alertas.';
  }
  return saveErrorMessage(caught, 'Não foi possível encerrar o alerta. Nada foi alterado. Tente de novo.');
}

/** WB-113 C2 "Resolvida" e WB-198: detalhe do alerta (o que fazer, atalhos para o pedido, a loja, a corrida e a troca) e "Marcar como resolvido" com nota. */
export function AlertDetailPage({ id }: { id: string }) {
  const { canView, canEdit } = useSession();
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const [resolving, setResolving] = useState(false);
  const allowed = canView('alertas');
  const query = useQuery({ queryKey: adminOpsKeys.alert(id), queryFn: () => adminOpsApi.alert(id), enabled: allowed });
  const offline = useIsOffline(query.error);
  if (!allowed) return <NoAccessState />;

  const back = <BackLink href="/admin/alertas">Voltar aos alertas</BackLink>;
  if (query.isPending) return <SkeletonRows rows={3} height={110} label="Carregando o alerta" />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <div className={s.page}>{back}<p className="wb-text-body" role="alert" data-testid={T('not-found')}>Não encontramos esse alerta para o seu perfil.</p></div>;
    }
    return <ErrorState offline={offline} onRetry={() => void query.refetch()} testId={T('detail-error')} />;
  }
  const alert = query.data;
  if (!alert) return null;
  const resolved = alert.status === 'resolved';
  const detailEntries = Object.entries(alert.details ?? {});
  const links: { key: string; label: string; href: string }[] = [];
  if (alert.links.orderId && canView('pedidos')) links.push({ key: 'order', label: 'Abrir o pedido', href: `/admin/pedidos/${alert.links.orderId}` });
  if (alert.links.storeId && canView('lojas')) links.push({ key: 'store', label: 'Abrir a loja', href: `/admin/lojas/${alert.links.storeId}` });
  if (alert.links.deliveryId && canView('logistica')) links.push({ key: 'delivery', label: 'Ver na Logística', href: '/admin/logistica' });
  if (alert.links.exchangeId && canView('disputas')) links.push({ key: 'exchange', label: 'Abrir a troca', href: `/admin/disputas/${alert.links.exchangeId}` });

  return (
    <div className={s.page}>
      {back}
      <PageHeader title={alert.label} description={ALERT_AREA_LABEL[alert.area]} action={<span className={s.actions}><SeverityBadge severity={alert.severity} /><Badge tone={resolved ? 'success' : 'neutral'} testId={T('status')}>{resolved ? 'Resolvido' : 'Aberto'}</Badge></span>} />
      <Banner tone={alert.severity === 'critical' && !resolved ? 'danger' : 'info'} testId={T('hint')}>
        <strong>O que fazer:</strong> {alert.hint}
      </Banner>
      <div className={s.blocks}>
        <section className={s.block} aria-labelledby="al-sum" data-testid={T('detail-summary')}>
          <h2 id="al-sum" className="wb-text-title2">Resumo</h2>
          <dl className={cx('wb-text-body', s.kv)}>
            <dt>Tipo</dt><dd>{alert.label}</dd>
            <dt>Área</dt><dd>{ALERT_AREA_LABEL[alert.area]}</dd>
            <dt>Aberto em</dt><dd>{formatFullDateTime(alert.createdAt)}</dd>
            <dt>Estado</dt><dd>{resolved ? 'Resolvido' : 'Aberto'}</dd>
            {resolved && alert.resolvedAt ? <><dt>Resolvido em</dt><dd>{formatFullDateTime(alert.resolvedAt)}</dd></> : null}
            {resolved ? <><dt>Resolvido por</dt><dd>{alert.resolvedByName ?? 'O sistema, sozinho'}</dd></> : null}
          </dl>
          {resolved && alert.resolutionNote ? <p className={cx('wb-text-body', s.quote)} data-testid={T('note')}><strong>Nota:</strong> {alert.resolutionNote}</p> : null}
        </section>
        <section className={s.block} aria-labelledby="al-act" data-testid={T('detail-actions')}>
          <h2 id="al-act" className="wb-text-title2">Onde resolver</h2>
          {links.length > 0 ? (
            <ul className={s.list}>
              {links.map((link) => (
                <li key={link.key}><Link href={asRoute(link.href)} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T(`link-${link.key}`)}>{link.label}</Link></li>
              ))}
            </ul>
          ) : (
            <p className={cx('wb-text-body', s.muted)}>Este alerta não aponta para um pedido, loja, corrida ou troca que o seu perfil abra.</p>
          )}
          {!resolved && canEdit('alertas') ? (
            <div>
              <Button variant="primary" icon={<CheckCircle size={20} aria-hidden="true" />} onClick={() => setResolving(true)} disabled={!online} data-testid={T('resolve')}>Marcar como resolvido</Button>
              <p className={cx('wb-text-caption', s.muted)} style={{ marginTop: 8 }}>Se o mesmo problema voltar, o sistema abre um alerta novo.</p>
            </div>
          ) : null}
          {!resolved && !canEdit('alertas') ? <p className={cx('wb-text-caption', s.muted)} data-testid={T('read-only')}>Seu perfil só consulta alertas. Peça à operação ou ao financeiro para encerrar.</p> : null}
        </section>
      </div>
      {detailEntries.length > 0 ? (
        <details className={s.block} data-testid={T('technical')}>
          <summary className={cx('wb-text-body-strong', s.summary)}>Dados técnicos do alerta</summary>
          <dl className={cx('wb-text-caption', s.kv)}>
            {detailEntries.map(([key, value]) => <div key={key} style={{ display: 'contents' }}><dt>{key}</dt><dd>{techValue(value)}</dd></div>)}
          </dl>
        </details>
      ) : null}

      {resolving ? (
        <ReasonDialog
          title="Marcar este alerta como resolvido?"
          description="Escreva o que foi feito ou por que o alerta se encerra. Fica no histórico do alerta e na auditoria."
          confirmLabel="Marcar como resolvido"
          fieldLabel="Nota"
          fieldNoun="a nota"
          minReason={5}
          maxReason={300}
          testIds={{ dialog: T('resolve-dialog'), reason: T('resolve-note'), confirm: T('resolve-confirm') }}
          onConfirm={async (note) => {
            try {
              await adminOpsApi.resolveAlert(alert.id, note);
            } catch (caught) {
              if (caught instanceof ApiError && (caught.code === 'ALERT_ALREADY_RESOLVED' || caught.status === 404)) void client.invalidateQueries({ queryKey: adminOpsKeys.alerts });
              throw new UserMessageError(resolveError(caught));
            }
            await client.invalidateQueries({ queryKey: adminOpsKeys.alerts });
            await client.invalidateQueries({ queryKey: ['admin', 'overview', 'pending'] });
            toast.show('Alerta resolvido. Registrado na auditoria.');
          }}
          onClose={() => setResolving(false)}
        />
      ) : null}
    </div>
  );
}
