'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, CheckboxField, Dialog, RadioCards, SelectField, TextField, ui, useToast, cx } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type BulkResult, type ProductSummary } from '@/lib/api/catalog';
import { formatCents } from '@/lib/format';
import { canApplyPreview, newIdempotencyKey, priceAdjustApplyBody, priceAdjustPreviewBody, type PriceAdjustIntent } from '@/lib/catalog/bulk';
import { parseCents, parseDecimal } from '@/lib/money';
import { ApiError } from '@/lib/api/errors';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './catalog.module.css';

const T = (id: string) => ltid('produtos', id);

export type BulkMode = 'pause' | 'resume' | 'move' | 'price';
type Mode = BulkMode;
/** O que a barra precisa de cada produto selecionado (a lista e a tabela de preços entregam formatos diferentes). */
export type BulkSelectable = Pick<ProductSummary, 'id' | 'basePriceCents'>;
export const BULK_MAX = 200;

interface Props {
  storeId: string;
  selected: BulkSelectable[];
  /** Preço em massa só do dono (onda-2 K6, hipótese Z-4). */
  canChangePrice: boolean;
  /** Ações oferecidas (padrão: todas). A tabela de preços usa só reajuste e pausa (design `v1-1-edicao-em-massa.md` §1). */
  actions?: readonly BulkMode[];
  onClear: () => void;
  /** `result` só vem do reajuste de preço (traz `batchId` e `undoUntil` para o "Desfazer"). */
  onDone: (changedIds: string[], result?: BulkResult) => void;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Espera o lojista parar de digitar antes de pedir a prévia ao servidor (uma chamada por valor, não por tecla). */
function useDebounced<T>(value: T, ms = 400): T {
  const [state, setState] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setState(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return state;
}

/** Ação em massa (K6): barra com a seleção e as folhas de confirmação, sempre com verbo + contagem no botão. */
export function BulkBar({ storeId, selected, canChangePrice, actions = ['pause', 'resume', 'move', 'price'], onClear, onDone }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const count = selected.length;
  const offers = (mode: Mode) => actions.includes(mode);
  return (
    <>
      <div className={s.bulkBar} role="region" aria-label="Ações em massa" data-testid={T('bulk-bar')}>
        <span className={cx('wb-text-body-strong', s.bulkCount)} role="status">
          {plural(count, 'selecionado', 'selecionados')}
        </span>
        {offers('pause') ? <Button variant="secondary" size="sm" onClick={() => setMode('pause')} data-testid={T('bulk-pause')}>Pausar</Button> : null}
        {offers('resume') ? <Button variant="secondary" size="sm" onClick={() => setMode('resume')} data-testid={T('bulk-resume')}>Reativar</Button> : null}
        {offers('move') ? <Button variant="secondary" size="sm" onClick={() => setMode('move')} data-testid={T('bulk-move')}>Mover de seção</Button> : null}
        {canChangePrice && offers('price') ? <Button variant="secondary" size="sm" onClick={() => setMode('price')} data-testid={T('bulk-price')}>Mudar preço</Button> : null}
        <Button variant="text" size="sm" onClick={onClear} data-testid={T('bulk-cancel')}>Cancelar seleção</Button>
      </div>
      {mode ? <BulkDialog mode={mode} storeId={storeId} selected={selected} onClose={() => setMode(null)} onDone={(ids, result) => { setMode(null); onDone(ids, result); }} /> : null}
    </>
  );
}

function BulkDialog({ mode, storeId, selected, onClose, onDone }: { mode: Mode; storeId: string; selected: BulkSelectable[]; onClose: () => void; onDone: (ids: string[], result?: BulkResult) => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const count = selected.length;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<BulkResult | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [unit, setUnit] = useState<'percent' | 'amount'>('percent');
  const [valueText, setValueText] = useState('');
  const [showAll, setShowAll] = useState(false);
  const sections = useQuery({ queryKey: catalogKeys.sections(storeId), queryFn: () => catalogApi.sections(storeId), enabled: mode === 'move' });

  // Reajuste (WB-377): quem calcula é o servidor (`dryRun`). Produto sem preço próprio fica de fora, como na 1.0.
  const pricedIds = useMemo(() => selected.filter((product) => product.basePriceCents !== null).map((product) => product.id), [selected]);
  const withoutPrice = count - pricedIds.length;
  const typed = unit === 'percent' ? parseDecimal(valueText) : parseCents(valueText);
  const typedValid = typed !== null && typed > 0;
  const intent: PriceAdjustIntent | null = typedValid ? { productIds: pricedIds, unit, value: direction === 'up' ? typed : -typed } : null;
  const intentId = intent ? `${intent.unit}:${intent.value}:${intent.productIds.join(',')}` : '';
  const settledId = useDebounced(intentId);
  const settled = settledId !== '' && settledId === intentId ? intent : null;
  const previewQuery = useQuery({
    queryKey: ['lojista', 'catalog-bulk-preview', storeId, settledId],
    queryFn: () => catalogApi.bulk(storeId, priceAdjustPreviewBody(settled as PriceAdjustIntent)),
    enabled: mode === 'price' && settled !== null && pricedIds.length > 0 && online,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const preview = settled ? previewQuery.data : undefined;
  const previewStamp = previewQuery.dataUpdatedAt;
  const waitingPreview = mode === 'price' && intent !== null && (settled === null || previewQuery.isFetching);
  const [confirmedStamp, setConfirmedStamp] = useState(0);
  const confirmed = confirmedStamp === previewStamp && previewStamp !== 0;
  // Uma `Idempotency-Key` por prévia: a retentativa do MESMO envio a reaproveita; prévia nova (ou valor novo) é outra intenção.
  const keyRef = useRef<{ stamp: number; key: string } | null>(null);
  const prices = preview?.preview ?? [];
  const blocked = preview?.blocked ?? [];

  const ids = selected.map((product) => product.id);
  const verb = mode === 'pause' ? 'Pausar' : mode === 'resume' ? 'Reativar' : mode === 'move' ? 'Mover' : direction === 'up' ? 'Aumentar preço de' : 'Diminuir preço de';
  const confirmCount = mode === 'price' ? (prices.length > 0 ? prices.length : pricedIds.length) : count;
  const confirmLabel = `${verb} ${plural(confirmCount, 'produto', 'produtos')}`;
  const title = mode === 'pause' ? 'Pausar produtos' : mode === 'resume' ? 'Reativar produtos' : mode === 'move' ? 'Mover de seção' : 'Mudar preço';
  const hasBlocked = mode === 'price' && blocked.length > 0;
  const canConfirm = mode === 'price' ? canApplyPreview(preview, confirmed) && !waitingPreview && online : true;

  async function confirm() {
    if (!online) return setError('Conecte-se para alterar vários produtos.');
    setBusy(true);
    setError(null);
    try {
      let result: BulkResult;
      let affected = ids;
      if (mode === 'price') {
        if (!settled || !preview) return;
        if (keyRef.current?.stamp !== previewStamp) keyRef.current = { stamp: previewStamp, key: newIdempotencyKey() };
        const body = priceAdjustApplyBody(settled, preview, confirmed);
        affected = body.productIds;
        result = await catalogApi.bulk(storeId, body, keyRef.current.key);
      } else {
        const action =
          mode === 'pause' ? ({ type: 'pause' } as const)
          : mode === 'resume' ? ({ type: 'resume' } as const)
          : ({ type: 'move_section', sectionId: sectionId === '' ? null : sectionId } as const);
        result = await catalogApi.bulk(storeId, { productIds: ids, action });
      }
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      if (result.blocked.length > 0) {
        setPartial(result);
        return;
      }
      toast.show(`${plural(result.changed, 'produto atualizado', 'produtos atualizados')}.`);
      onDone(affected, result);
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não foi possível salvar. Tentar de novo.'));
      // Prévia velha (alguém editou, ou pede confirmação): nada foi aplicado; refaz a prévia e deixa a mensagem na tela.
      if (mode === 'price' && caught instanceof ApiError && ['BULK_VERSION_CONFLICT', 'BULK_NEEDS_CONFIRMATION', 'BULK_BLOCKED', 'IDEMPOTENCY_KEY_REUSED'].includes(caught.code)) {
        keyRef.current = null;
        void client.invalidateQueries({ queryKey: catalogKeys.all });
        void previewQuery.refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  const lines = showAll ? prices : prices.slice(0, 5);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      locked={busy}
      wide={mode === 'price'}
      testId={T(`bulk-dialog-${mode}`)}
      actions={
        partial ? (
          <Button onClick={() => onDone(ids.filter((id) => !partial.blocked.some((b) => b.productId === id)))}>Fechar</Button>
        ) : (
          <>
            {hasBlocked ? (
              <Button variant="secondary" onClick={() => { setValueText(''); setError(null); }} data-testid={T('bulk-adjust-again')}>Ajustar de novo</Button>
            ) : (
              <Button variant={mode === 'pause' ? 'destructive' : 'primary'} onClick={() => void confirm()} loading={busy} loadingLabel="Salvando…" disabled={!canConfirm} data-testid={T('bulk-confirm')}>
                {confirmLabel}
              </Button>
            )}
            <Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button>
          </>
        )
      }
    >
      {partial ? (
        <div className={ui.stack} data-testid={T('bulk-errors')}>
          <p className="wb-text-body" style={{ margin: 0 }}>
            {partial.changed} {partial.changed === 1 ? 'produto foi atualizado' : 'produtos foram atualizados'} e {partial.blocked.length} não.
          </p>
          <ul className={s.previewList}>
            {partial.blocked.map((item) => (
              <li key={item.productId} className="wb-text-body">{item.name}: {item.reason}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={ui.stack}>
          {!online ? <Banner tone="warning" offline>Conecte-se para alterar vários produtos.</Banner> : null}
          {mode === 'pause' ? <p className="wb-text-body" style={{ margin: 0 }}>Eles saem da vitrine até você reativar. Pedidos em andamento continuam.</p> : null}
          {mode === 'resume' ? <p className="wb-text-body" style={{ margin: 0 }}>Os produtos voltam a aparecer na vitrine. Rascunhos e produtos pausados pelo Webag não mudam.</p> : null}
          {mode === 'move' ? (
            <SelectField label="Seção de destino" value={sectionId} onChange={(event) => setSectionId(event.target.value)} hint="Sem seção, o produto fica em Outros.">
              <option value="">Outros (sem seção)</option>
              {(sections.data?.data ?? []).map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </SelectField>
          ) : null}
          {mode === 'price' ? (
            <>
              <RadioCards
                legend="O que fazer com o preço"
                name="bulk-direction"
                value={direction}
                onChange={(next) => { setDirection(next); setError(null); }}
                options={[
                  { value: 'up', label: 'Aumentar', testId: T('bulk-direction-up') },
                  { value: 'down', label: 'Diminuir', testId: T('bulk-direction-down') },
                ]}
              />
              <div className={s.bulkApply}>
                <TextField label="Valor" inputMode="decimal" value={valueText} onChange={(event) => { setValueText(event.target.value); setError(null); }} data-testid={T('bulk-value')} />
                <SelectField label="Unidade" value={unit} onChange={(event) => { setUnit(event.target.value as 'percent' | 'amount'); setError(null); }} data-testid={T('bulk-unit')}>
                  <option value="percent">%</option>
                  <option value="amount">R$</option>
                </SelectField>
              </div>
              {withoutPrice > 0 ? (
                <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>
                  {plural(withoutPrice, 'produto selecionado não tem preço próprio e fica de fora', 'produtos selecionados não têm preço próprio e ficam de fora')}.
                </p>
              ) : null}
              {intent ? (
                <div data-testid={T('bulk-preview')} className={ui.stack} aria-busy={waitingPreview}>
                  {waitingPreview ? <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }} role="status">Calculando como os preços ficam…</p> : null}
                  {!waitingPreview && previewQuery.isError ? (
                    <Banner tone="danger" testId={T('bulk-preview-error')}>
                      {catalogErrorMessage(previewQuery.error, 'Não foi possível calcular a prévia.')}{' '}
                      <button type="button" className={s.linkButton} onClick={() => void previewQuery.refetch()}>Tentar de novo</button>
                    </Banner>
                  ) : null}
                  {!waitingPreview && blocked.length > 0 ? (
                    <Banner tone="danger" testId={T('bulk-blocked')}>
                      {plural(blocked.length, 'produto impede', 'produtos impedem')} o reajuste e nada seria alterado: {blocked.map((item) => `${item.name} (${item.reason})`).join(' ')}
                    </Banner>
                  ) : null}
                  {!waitingPreview && preview && prices.length > 0 ? (
                    <>
                      <p className="wb-text-body-strong" style={{ margin: 0 }}>{plural(prices.length, 'produto será alterado', 'produtos serão alterados')}.</p>
                      <ul className={s.previewList}>
                        {lines.map((line) => (
                          <li key={line.productId} className="wb-text-body">
                            {line.name}: {formatCents(line.fromCents)} → {formatCents(line.toCents)}
                            {line.youReceiveCents !== null ? ` (você recebe ${formatCents(line.youReceiveCents)})` : ''}
                            {line.exceedsLimit ? ' · variação grande' : ''}
                          </li>
                        ))}
                      </ul>
                      {prices.length > 5 ? (
                        <button type="button" className={s.linkButton} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ver menos' : 'Ver todos'}</button>
                      ) : null}
                      {preview.requiresConfirmation && blocked.length === 0 ? (
                        <div className={ui.stack} data-testid={T('bulk-large-change')}>
                          <Banner tone="warning">Reajuste grande em pelo menos um produto. Confira os valores antes de aplicar.</Banner>
                          <CheckboxField label="Conferi os valores novos" checked={confirmed} onChange={(event) => setConfirmedStamp(event.target.checked ? previewStamp : 0)} data-testid={T('bulk-large-confirm')} />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
                <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Digite o valor para ver como os preços ficam antes de confirmar.</p>
              )}
            </>
          ) : (
            <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>{plural(count, 'produto selecionado', 'produtos selecionados')}.</p>
          )}
          {error ? <Banner tone="danger" testId={T('bulk-error')}>{error}</Banner> : null}
        </div>
      )}
    </Dialog>
  );
}
