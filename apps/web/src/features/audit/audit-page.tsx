'use client';

import { ClockCounterClockwise } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { DiffView, diffRows } from '@/components/panel/diff-view';
import { useSession } from '@/components/panel/session-context';
import { SplitLayout } from '@/components/panel/split-layout';
import { Banner, Button, EmptyState, ErrorState, NoAccessState, SelectField, SkeletonRows, TextField, cx, ui } from '@/components/ui';
import s from '@/components/panel/panel.module.css';
import { adminApi, keys, type AuditFilters, type AuditRow } from '@/lib/api/admin';
import { PROFILE_LABEL } from '@/lib/admin-access';
import { ApiError } from '@/lib/api/errors';
import type { AdminProfile } from '@/lib/session-types';
import { formatClock, formatDateTime, formatFullDateTime } from '@/lib/format';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ACTION_LABEL, actionLabel, periodRange, targetText, type Period } from './catalog';

const T = (id: string) => tid('auditoria', id);

export interface AuditInitial {
  targetType?: string;
  targetId?: string;
  actorId?: string;
}

function Detail({ row, who }: { row: AuditRow; who: string }) {
  return (
    <div className={ui.stack} data-testid={T('detail')}>
      <dl className={s.detailGrid} style={{ margin: 0 }}>
        <dt className={cx('wb-text-caption-strong', ui.muted)}>Quem</dt>
        <dd style={{ margin: 0 }}>{who}</dd>
        <dt className={cx('wb-text-caption-strong', ui.muted)}>Quando</dt>
        <dd style={{ margin: 0 }}>{formatFullDateTime(row.at)} (Brasília)</dd>
        <dt className={cx('wb-text-caption-strong', ui.muted)}>De onde</dt>
        <dd style={{ margin: 0 }}>{row.ip ?? 'Não registrado'}</dd>
        <dt className={cx('wb-text-caption-strong', ui.muted)}>Ação</dt>
        <dd style={{ margin: 0 }}>{actionLabel(row.action)} <span className={ui.muted}>({row.action})</span></dd>
        <dt className={cx('wb-text-caption-strong', ui.muted)}>Alvo</dt>
        <dd style={{ margin: 0 }}>{row.targetType ? `${row.targetType}${row.targetId ? `: ${row.targetId}` : ''}` : '—'}</dd>
        <dt className={cx('wb-text-caption-strong', ui.muted)}>Motivo</dt>
        <dd style={{ margin: 0 }}>{row.reason ?? 'Não informado'}</dd>
      </dl>
      <h3 className="wb-text-title2" style={{ margin: 0 }}>Antes e depois</h3>
      <DiffView rows={diffRows(row.before, row.after)} testId={T('detail-diff')} />
      <p className={cx('wb-text-caption', s.footerNote)} style={{ margin: 0 }}>Este registro não pode ser editado nem apagado.</p>
    </div>
  );
}

export function AuditPage({ initial = {} }: { initial?: AuditInitial }) {
  const { canView } = useSession();
  const online = useOnline();
  const [period, setPeriod] = useState<Period>(initial.targetId || initial.actorId ? 'all' : '7d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [actorId, setActorId] = useState(initial.actorId ?? '');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState(initial.targetId ?? '');
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const admins = useQuery({ queryKey: keys.admins, queryFn: adminApi.admins, enabled: canView('auditoria') });
  const names = new Map((admins.data?.data ?? []).map((a) => [a.userId, a.name]));

  const filters: AuditFilters = {
    ...periodRange(period, custom),
    actorId: actorId || undefined,
    action: action || undefined,
    targetType: initial.targetType && target === initial.targetId ? initial.targetType : undefined,
    targetId: target.trim() || undefined,
  };
  const query = useInfiniteQuery({
    queryKey: keys.audit(filters),
    queryFn: ({ pageParam }) => adminApi.audit(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: canView('auditoria'),
  });
  if (!canView('auditoria')) return <NoAccessState />;

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const who = (row: AuditRow) => (row.actorId ? (names.get(row.actorId) ?? 'Admin') : 'Sistema') + (row.actorRole ? ` · ${PROFILE_LABEL[row.actorRole as AdminProfile] ?? row.actorRole}` : '');
  const filtered = Boolean(actorId || action || target || period !== '7d');
  const clear = () => {
    setPeriod('7d');
    setActorId('');
    setAction('');
    setTarget('');
  };

  const list = (
    <div className={ui.stack}>
      <div className={s.filters} role="search" aria-label="Filtros da auditoria">
        <SelectField label="Período" value={period} onChange={(e) => setPeriod(e.target.value as Period)} data-testid={T('filter-period')}>
          <option value="today">Hoje</option>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
          <option value="custom">Personalizado</option>
          <option value="all">Todo o histórico</option>
        </SelectField>
        <SelectField label="Quem" value={actorId} onChange={(e) => setActorId(e.target.value)} data-testid={T('filter-actor')}>
          <option value="">Todos</option>
          {(admins.data?.data ?? []).map((a) => (
            <option key={a.userId} value={a.userId}>{a.name}</option>
          ))}
        </SelectField>
        <SelectField label="Ação" value={action} onChange={(e) => setAction(e.target.value)} data-testid={T('filter-action')}>
          <option value="">Todas</option>
          {Object.entries(ACTION_LABEL).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </SelectField>
        <TextField label="Alvo" value={target} onChange={(e) => setTarget(e.target.value)} hint="Chave ou identificador" autoComplete="off" data-testid={T('filter-target')} />
        {period === 'custom' ? (
          <>
            <TextField label="De" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} data-testid={T('filter-from')} />
            <TextField label="Até" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} data-testid={T('filter-to')} />
          </>
        ) : null}
      </div>
      <div className={ui.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={cx('wb-text-caption', ui.muted)} aria-live="polite">{query.dataUpdatedAt ? `Atualizada às ${formatClock(new Date(query.dataUpdatedAt))}` : ''}</span>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()} loading={query.isRefetching && !query.isFetchingNextPage} loadingLabel="Atualizando…" data-testid={T('refresh')}>Atualizar</Button>
      </div>
      {!online ? <Banner tone="warning" offline>Sem conexão. Mostrando o que já carregou.</Banner> : null}
      {query.isPending ? (
        <SkeletonRows rows={8} height={56} label="Carregando auditoria" />
      ) : query.isError && rows.length === 0 ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClockCounterClockwise} title="Nenhum registro neste período" text="Tente outro período ou tire um filtro." actionLabel={filtered ? 'Limpar filtros' : undefined} onAction={clear} testId={T('empty')} />
      ) : (
        <>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption>Registro de auditoria, do mais recente para o mais antigo</caption>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Quem</th>
                  <th scope="col">Ação</th>
                  <th scope="col">Alvo</th>
                  <th scope="col">IP</th>
                  <th scope="col"><span className={ui.srOnly}>Ver</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-testid={T(`row-${row.id}`)}>
                    <td data-primary className="wb-text-body-strong">{formatDateTime(row.at)}</td>
                    <td data-label="Quem">{who(row)}</td>
                    <td data-label="Ação">{actionLabel(row.action)}</td>
                    <td data-label="Alvo">{targetText(row.targetType, row.targetId)}</td>
                    <td data-label="IP">{row.ip ?? '—'}</td>
                    <td>
                      <Button size="sm" variant="secondary" onClick={() => setSelected(row)} aria-label={`Ver detalhe: ${actionLabel(row.action)}, ${formatDateTime(row.at)}`} data-testid={T(`row-${row.id}-open`)}>Ver</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.isError ? <Banner tone="danger">Não conseguimos carregar mais registros.</Banner> : null}
          {query.hasNextPage ? (
            <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('load-more')}>Carregar mais</Button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <>
      <PageHeader title="Auditoria" description="Quem fez o quê, quando e de onde. Só leitura." />
      <SplitLayout list={list} panelOpen={selected !== null} onClosePanel={() => setSelected(null)} panelTitle="Detalhe do registro" panel={selected ? <Detail row={selected} who={who(selected)} /> : null} />
    </>
  );
}
