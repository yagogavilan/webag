'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Banner, Button, Dialog, RadioCards, SelectField, TextField, ui, useToast, cx } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type BulkResult, type ProductSummary } from '@/lib/api/catalog';
import { formatCents } from '@/lib/format';
import { adjustPrice, MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '@/lib/catalog/helpers';
import { parseCents, parseDecimal } from '@/lib/money';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './catalog.module.css';

const T = (id: string) => ltid('produtos', id);

type Mode = 'pause' | 'resume' | 'move' | 'price';
export const BULK_MAX = 200;

interface Props {
  storeId: string;
  selected: ProductSummary[];
  /** Preço em massa só do dono (onda-2 K6, hipótese Z-4). */
  canChangePrice: boolean;
  onClear: () => void;
  onDone: (changedIds: string[]) => void;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Ação em massa (K6): barra com a seleção e as folhas de confirmação, sempre com verbo + contagem no botão. */
export function BulkBar({ storeId, selected, canChangePrice, onClear, onDone }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const count = selected.length;
  return (
    <>
      <div className={s.bulkBar} role="region" aria-label="Ações em massa" data-testid={T('bulk-bar')}>
        <span className={cx('wb-text-body-strong', s.bulkCount)} role="status">
          {plural(count, 'selecionado', 'selecionados')}
        </span>
        <Button variant="secondary" size="sm" onClick={() => setMode('pause')} data-testid={T('bulk-pause')}>Pausar</Button>
        <Button variant="secondary" size="sm" onClick={() => setMode('resume')} data-testid={T('bulk-resume')}>Reativar</Button>
        <Button variant="secondary" size="sm" onClick={() => setMode('move')} data-testid={T('bulk-move')}>Mover de seção</Button>
        {canChangePrice ? <Button variant="secondary" size="sm" onClick={() => setMode('price')} data-testid={T('bulk-price')}>Mudar preço</Button> : null}
        <Button variant="text" size="sm" onClick={onClear} data-testid={T('bulk-cancel')}>Cancelar seleção</Button>
      </div>
      {mode ? <BulkDialog mode={mode} storeId={storeId} selected={selected} onClose={() => setMode(null)} onDone={(ids) => { setMode(null); onDone(ids); }} /> : null}
    </>
  );
}

function BulkDialog({ mode, storeId, selected, onClose, onDone }: { mode: Mode; storeId: string; selected: ProductSummary[]; onClose: () => void; onDone: (ids: string[]) => void }) {
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

  const price = useMemo(() => {
    const raw = unit === 'percent' ? parseDecimal(valueText) : parseCents(valueText);
    if (raw === null || raw <= 0) return { valid: false as const, signed: 0, lines: [], blocked: [] as ProductSummary[] };
    const signed = direction === 'up' ? raw : -raw;
    const priced = selected.filter((product) => product.basePriceCents !== null);
    const lines = priced.map((product) => {
      const next = adjustPrice(product.basePriceCents as number, unit, signed);
      return { product, from: product.basePriceCents as number, to: next };
    });
    return { valid: true as const, signed, lines, blocked: lines.filter((line) => line.to < MIN_PRICE_CENTS || line.to > MAX_PRICE_CENTS).map((line) => line.product) };
  }, [selected, direction, unit, valueText]);

  const ids = selected.map((product) => product.id);
  const verb = mode === 'pause' ? 'Pausar' : mode === 'resume' ? 'Reativar' : mode === 'move' ? 'Mover' : direction === 'up' ? 'Aumentar preço de' : 'Diminuir preço de';
  const confirmLabel = `${verb} ${plural(count, 'produto', 'produtos')}`;
  const title = mode === 'pause' ? 'Pausar produtos' : mode === 'resume' ? 'Reativar produtos' : mode === 'move' ? 'Mover de seção' : 'Mudar preço';
  const canConfirm = mode === 'price' ? price.valid && price.blocked.length === 0 && count > 0 : true;

  async function confirm() {
    if (!online) return setError('Conecte-se para alterar vários produtos.');
    setBusy(true);
    setError(null);
    try {
      const action =
        mode === 'pause' ? ({ type: 'pause' } as const)
        : mode === 'resume' ? ({ type: 'resume' } as const)
        : mode === 'move' ? ({ type: 'move_section', sectionId: sectionId === '' ? null : sectionId } as const)
        : ({ type: 'price_adjust', mode: unit, value: price.signed } as const);
      const result = await catalogApi.bulk(storeId, { productIds: ids, action });
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      if (result.blocked.length > 0) {
        setPartial(result);
        return;
      }
      toast.show(`${plural(result.changed, 'produto atualizado', 'produtos atualizados')}.`);
      onDone(ids);
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não foi possível salvar. Tentar de novo.'));
    } finally {
      setBusy(false);
    }
  }

  const lines = showAll ? price.lines : price.lines.slice(0, 5);
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
            {canConfirm ? (
              <Button variant={mode === 'pause' ? 'destructive' : 'primary'} onClick={() => void confirm()} loading={busy} loadingLabel="Salvando…" data-testid={T('bulk-confirm')}>
                {confirmLabel}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setValueText('')} data-testid={T('bulk-adjust-again')}>Ajustar de novo</Button>
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
                onChange={setDirection}
                options={[
                  { value: 'up', label: 'Aumentar', testId: T('bulk-direction-up') },
                  { value: 'down', label: 'Diminuir', testId: T('bulk-direction-down') },
                ]}
              />
              <div className={s.bulkApply}>
                <TextField label="Valor" inputMode="decimal" value={valueText} onChange={(event) => setValueText(event.target.value)} data-testid={T('bulk-value')} />
                <SelectField label="Unidade" value={unit} onChange={(event) => setUnit(event.target.value as 'percent' | 'amount')} data-testid={T('bulk-unit')}>
                  <option value="percent">%</option>
                  <option value="amount">R$</option>
                </SelectField>
              </div>
              {price.valid ? (
                <div data-testid={T('bulk-preview')} className={ui.stack}>
                  {price.blocked.length > 0 ? (
                    <Banner tone="danger" testId={T('bulk-blocked')}>
                      {plural(price.blocked.length, 'produto ficaria', 'produtos ficariam')} com preço fora da faixa (de R$ 0,01 a R$ 99.999,99): {price.blocked.map((p) => p.name).join(', ')}.
                    </Banner>
                  ) : null}
                  <p className="wb-text-body-strong" style={{ margin: 0 }}>{plural(price.lines.length, 'produto será alterado', 'produtos serão alterados')}.</p>
                  <ul className={s.previewList}>
                    {lines.map((line) => (
                      <li key={line.product.id} className="wb-text-body">
                        {line.product.name}: {formatCents(line.from)} → {formatCents(Math.max(0, line.to))}
                      </li>
                    ))}
                  </ul>
                  {price.lines.length > 5 ? (
                    <button type="button" className={s.linkButton} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ver menos' : 'Ver todos'}</button>
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
