'use client';

import { Receipt } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, Dialog, EmptyState, ErrorState, SkeletonRows, TextField, cx, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { KIND_LABEL, STATUS_LABEL, logisticsApi, logisticsKeys, type Delivery, type DeliveryKind } from '@/lib/api/logistics';
import { formatCents, formatDateTime } from '@/lib/format';
import { parseCents } from '@/lib/money';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './logistics.module.css';

const T = (id: string) => tid('logistica', `history.${id}`);

/** Resultado da corrida: taxa cobrada do cliente menos o custo pago ao motoboy. Sem custo lançado, não há resultado. */
export function resultOf(delivery: Pick<Delivery, 'fee' | 'cost'>): number | null {
  return delivery.cost ? delivery.fee.amount - delivery.cost.amount : null;
}

export function summarize(rows: Pick<Delivery, 'fee' | 'cost'>[]) {
  const withCost = rows.filter((row) => row.cost);
  return {
    count: rows.length,
    cost: withCost.reduce((sum, row) => sum + (row.cost?.amount ?? 0), 0),
    fee: rows.reduce((sum, row) => sum + row.fee.amount, 0),
    result: withCost.reduce((sum, row) => sum + (resultOf(row) ?? 0), 0),
    withoutCost: rows.length - withCost.length,
  };
}

/** LG6: histórico e custo por entrega. O custo é só do admin; nunca aparece para a loja. */
export function HistoryTab({ canWrite, onOpen }: { canWrite: boolean; onOpen: (id: string) => void }) {
  const online = useOnline();
  const [noCostOnly, setNoCostOnly] = useState(false);
  const [editing, setEditing] = useState<Delivery | null>(null);
  const query = useInfiniteQuery({
    queryKey: logisticsKeys.done,
    queryFn: ({ pageParam }) => logisticsApi.deliveries({ tab: 'done', limit: 25, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (query.isPending) return <SkeletonRows rows={6} height={72} label="Carregando o histórico" />;
  if (query.isError && !query.data) return <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />;
  const all = query.data?.pages.flatMap((page) => page.data) ?? [];
  const rows = noCostOnly ? all.filter((row) => !row.cost) : all;
  const total = summarize(all);
  if (all.length === 0) return <EmptyState icon={Receipt} title="Nenhuma entrega hoje" text="Os trabalhos concluídos aparecem aqui." testId={T('empty')} />;
  return (
    <>
      <ul className={s.summary} aria-label="Resumo do histórico">
        <li className={s.kpi} data-testid={T('kpi-count')}><p className={s.kpiValue}>{total.count}</p><p className={cx('wb-text-caption', s.kpiLabel)}>corridas</p></li>
        <li className={s.kpi} data-testid={T('kpi-cost')}><p className={s.kpiValue}>{formatCents(total.cost)}</p><p className={cx('wb-text-caption', s.kpiLabel)}>custo total</p></li>
        <li className={s.kpi} data-testid={T('kpi-fee')}><p className={s.kpiValue}>{formatCents(total.fee)}</p><p className={cx('wb-text-caption', s.kpiLabel)}>taxa recebida</p></li>
        <li className={s.kpi} data-testid={T('kpi-result')}><p className={s.kpiValue}>{formatCents(total.result)}</p><p className={cx('wb-text-caption', s.kpiLabel)}>{total.result < 0 ? 'prejuízo' : 'resultado'}</p></li>
      </ul>
      <div className={s.chips}>
        <button type="button" className={cx(s.chip, noCostOnly && s.chipOn, 'wb-text-body-strong')} aria-pressed={noCostOnly} onClick={() => setNoCostOnly((v) => !v)} data-testid={T('filter-no-cost')}>
          Sem custo informado ({total.withoutCost})
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="wb-text-body">Nenhum trabalho neste filtro.</p>
      ) : (
        <ul className={s.list} aria-label="Trabalhos concluídos">
          {rows.map((row) => {
            const result = resultOf(row);
            return (
              <li key={row.id}>
                <div className={s.row} data-testid={T(`row-${row.id}`)}>
                  <button type="button" className={s.rowMain} onClick={() => onOpen(row.id)}>
                    <span className="wb-text-body-strong">{row.orderNumber ? `#${row.orderNumber} · ` : ''}{row.storeName ?? 'Loja'}</span>
                    <span className={cx('wb-text-caption', s.muted)}>{KIND_LABEL[row.kind as DeliveryKind]} · {STATUS_LABEL[row.status]} · {row.courier?.name ?? 'sem motoboy'} · {formatDateTime(row.updatedAt)}</span>
                    <span className="wb-text-caption">
                      Taxa {formatCents(row.fee.amount)} · {row.cost ? `custo ${formatCents(row.cost.amount)}` : <strong data-testid={T('no-cost-badge')}>Sem custo</strong>}
                      {result !== null ? ` · ${result < 0 ? `prejuízo de ${formatCents(-result)}` : `resultado ${formatCents(result)}`}` : ''}
                    </span>
                  </button>
                  {canWrite ? <Button className={s.rowAction} variant="secondary" size="sm" onClick={() => setEditing(row)} data-testid={T(`row-${row.id}-cost`)}>{row.cost ? 'Editar custo' : 'Informar custo'}</Button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {query.hasNextPage ? <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…">Ver mais</Button> : null}
      {editing ? <CostDialog delivery={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function CostDialog({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(delivery.cost ? (delivery.cost.amount / 100).toFixed(2).replace('.', ',') : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsReason, setNeedsReason] = useState(Boolean(delivery.cost));
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cents = parseCents(value);
    if (cents === null) {
      setError('Informe o custo da corrida.');
      return;
    }
    if (needsReason && reason.trim().length < 3) {
      setError('Escreva o motivo da correção.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await logisticsApi.setCost(delivery.id, { costCents: cents, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      toast.show('Custo salvo.');
      void client.invalidateQueries({ queryKey: logisticsKeys.all });
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && (caught.code === 'COST_REASON_REQUIRED' || caught.code === 'COST_ABOVE_LIMIT')) {
        setNeedsReason(caught.code === 'COST_REASON_REQUIRED' || needsReason);
        setError(caught.code === 'COST_ABOVE_LIMIT' ? 'Esse valor passa do limite permitido.' : 'Valor acima do previsto: escreva o motivo.');
      } else setError('Não foi possível salvar. Nada foi alterado.');
      setBusy(false);
    }
  }

  return (
    <Dialog title="Custo da corrida" onClose={onClose} locked={busy} testId={T('cost-dialog')} actions={<><Button size="lg" onClick={() => void submit()} loading={busy} loadingLabel="Salvando…" data-testid={T('cost-save')}>Salvar custo</Button><Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <p className="wb-text-body" style={{ margin: 0 }}>Previsto para esta faixa: {formatCents(delivery.expectedCost.amount)}. Taxa cobrada do cliente: {formatCents(delivery.fee.amount)}.</p>
      <TextField label="Custo pago ao motoboy" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} data-testid={T('cost-input')} />
      {needsReason ? <TextField label="Motivo (obrigatório ao corrigir ou acima do previsto)" value={reason} onChange={(event) => setReason(event.target.value)} data-testid={T('cost-reason')} /> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
