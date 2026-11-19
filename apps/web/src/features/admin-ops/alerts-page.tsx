'use client';

import { BellRinging } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Kpi } from '@/components/panel/blocks';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, Button, EmptyState, ErrorState, NoAccessState, SelectField, SkeletonRows, cx } from '@/components/ui';
import { ALERT_AREA_LABEL, ALERT_SEVERITY_LABEL, adminOpsApi, adminOpsKeys, type AdminAlert, type AdminAlertSeverity, type AlertFilters, type AlertStatusFilter } from '@/lib/api/admin-ops';
import { formatDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { ageText, SeverityBadge, useIsOffline } from './common';
import s from './ops.module.css';

const T = (id: string) => tid('alertas', id);

const STATUS_CHIPS: { id: AlertStatusFilter; label: string }[] = [
  { id: 'open', label: 'Abertos' },
  { id: 'resolved', label: 'Resolvidos' },
  { id: 'all', label: 'Todos' },
];

/** B3, WB-198 (leitura) e WB-113 C2: a caixa de alertas de operação. A API devolve só os tipos do perfil (dinheiro, pedidos, privacidade...). */
export function AlertsPage() {
  const { canView } = useSession();
  const [status, setStatus] = useState<AlertStatusFilter>('open');
  const [severity, setSeverity] = useState<AdminAlertSeverity | ''>('');
  const [kind, setKind] = useState('');
  const filters: AlertFilters = { status, severity: severity || undefined, kind: kind || undefined };
  const allowed = canView('alertas');

  const summary = useQuery({ queryKey: adminOpsKeys.alertSummary, queryFn: () => adminOpsApi.alertsSummary(), enabled: allowed, refetchInterval: 60_000 });
  const kinds = useQuery({ queryKey: adminOpsKeys.alertKinds, queryFn: () => adminOpsApi.alertKinds(), enabled: allowed, staleTime: 10 * 60_000 });
  const list = useInfiniteQuery({
    queryKey: adminOpsKeys.alertList(filters),
    queryFn: ({ pageParam }) => adminOpsApi.alerts(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: allowed,
  });
  const offline = useIsOffline(list.error);
  if (!allowed) return <NoAccessState />;

  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const sum = summary.data;
  return (
    <div className={s.page}>
      <PageHeader title="Alertas" description="O que o sistema pede a uma pessoa. Você vê os tipos do seu perfil." />
      {sum ? (
        <ul className={s.kpis} aria-label="Resumo dos alertas abertos" data-testid={T('summary')}>
          <li><Kpi label="Abertos" value={sum.open} tone={sum.open > 0 ? 'night' : 'neutral'} testId={T('kpi-open')} /></li>
          <li><Kpi label="Críticos" value={sum.bySeverity.critical} tone={sum.bySeverity.critical > 0 ? 'danger' : 'neutral'} hint={sum.bySeverity.critical > 0 ? 'Dinheiro ou prazo legal em risco' : undefined} testId={T('kpi-critical')} /></li>
          <li><Kpi label="Aguardando ação" value={sum.bySeverity.warning} testId={T('kpi-warning')} /></li>
          <li><Kpi label="Mais antigo" value={sum.oldestOpenAt ? ageText(sum.oldestOpenAt) : '-'} hint={sum.oldestOpenAt ? 'aberto' : 'Nenhum aberto'} testId={T('kpi-oldest')} /></li>
        </ul>
      ) : null}
      <div className={s.chips} role="group" aria-label="Estado do alerta">
        {STATUS_CHIPS.map((chip) => (
          <button key={chip.id} type="button" className={cx(s.chip, status === chip.id && s.chipOn, 'wb-text-body-strong')} aria-pressed={status === chip.id} onClick={() => setStatus(chip.id)} data-testid={T(`filter-${chip.id}`)}>{chip.label}</button>
        ))}
      </div>
      <div className={s.filters}>
        <SelectField label="Gravidade" value={severity} onChange={(e) => setSeverity(e.target.value as AdminAlertSeverity | '')} data-testid={T('severity')}>
          <option value="">Todas</option>
          {(['critical', 'warning', 'info'] as const).map((v) => <option key={v} value={v}>{ALERT_SEVERITY_LABEL[v]}</option>)}
        </SelectField>
        <SelectField label="Tipo de alerta" value={kind} onChange={(e) => setKind(e.target.value)} data-testid={T('kind')}>
          <option value="">Todos os tipos</option>
          {(kinds.data?.data ?? []).map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </SelectField>
      </div>

      {list.isPending ? (
        <SkeletonRows rows={4} height={110} label="Carregando os alertas" />
      ) : list.isError && !list.data ? (
        <ErrorState offline={offline} onRetry={() => void list.refetch()} testId={T('error')} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BellRinging}
          title={status === 'open' && !severity && !kind ? 'Nenhum alerta aberto' : 'Nenhum alerta com esse filtro'}
          text={status === 'open' && !severity && !kind ? 'Quando o sistema precisar de uma pessoa, o alerta aparece aqui e no Início.' : 'Troque o estado, a gravidade ou o tipo para ver outros.'}
          testId={T('empty')}
        />
      ) : (
        <>
          <ul className={s.list} aria-label="Alertas" data-testid={T('list')}>
            {rows.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
          </ul>
          {list.hasNextPage ? <Button variant="secondary" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('more')}>Ver mais</Button> : null}
        </>
      )}
    </div>
  );
}

function AlertCard({ alert }: { alert: AdminAlert }) {
  const resolved = alert.status === 'resolved';
  return (
    <li className={cx(s.card, !resolved && alert.severity === 'critical' && s.cardCritical)} data-testid={T(`row-${alert.id}`)}>
      <div className={s.cardTop}>
        <Link href={asRoute(`/admin/alertas/${alert.id}`)} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T(`open-${alert.id}`)}>{alert.label}</Link>
        <span className={s.actions}>
          <SeverityBadge severity={alert.severity} />
          <Badge tone={resolved ? 'success' : 'neutral'}>{resolved ? 'Resolvido' : 'Aberto'}</Badge>
        </span>
      </div>
      <p className={cx('wb-text-body', s.muted)}>{alert.hint}</p>
      <p className={cx('wb-text-caption', s.muted)}>
        {ALERT_AREA_LABEL[alert.area]} · aberto em {formatDateTime(alert.createdAt)}
        {resolved && alert.resolvedAt ? ` · resolvido em ${formatDateTime(alert.resolvedAt)}${alert.resolvedByName ? ` por ${alert.resolvedByName}` : ' pelo sistema'}` : ''}
      </p>
    </li>
  );
}
