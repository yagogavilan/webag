'use client';

import { Check, Minus, Plus, Warning } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ActionMenu, Badge, Button, Dialog, SafeImage, Switch, ui, cx, useToast, SkeletonRows } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type ProductSummary } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { formatCents } from '@/lib/format';
import { isModeratedOff, moderationLabel, pickImage, stockLabel, MAX_STOCK } from '@/lib/catalog/helpers';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { useDuplicate } from './quick/use-duplicate';
import s from './catalog.module.css';

const T = (id: string) => ltid('produtos', id);
const DEBOUNCE_MS = 600;
const OFFLINE_ROW = 'Conecte-se para alterar. Nada foi mudado.';

interface RowProps {
  storeId: string;
  product: ProductSummary;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  /** Mexido em massa nesta sessão: marca "Atualizado". */
  updated: boolean;
}

/** Foto de 48 px (miniatura leve) ou o objeto da marca quando o produto não tem foto ou a foto não carrega. */
export function Thumb({ cover }: { cover: Record<string, string> | null }) {
  const url = pickImage(cover, 160);
  return (
    <span className={s.thumb}>
      <SafeImage src={url} alt="" width={48} height={48} style={{ width: '100%', height: '100%', objectFit: 'cover' }} testId={T('thumb')} />
    </span>
  );
}

function priceText(product: ProductSummary): string {
  if (product.fromPriceCents === null) return 'Sem preço';
  return `${product.variantCount > 1 ? 'a partir de ' : ''}${formatCents(product.fromPriceCents)}`;
}

/** Linha da lista (K1): foto, nome, preço, estoque com ajuste rápido e o interruptor "Vendendo/Pausado". */
export function ProductRow({ storeId, product, selected, onSelect, updated }: RowProps) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const dup = useDuplicate(storeId);
  const moderated = isModeratedOff(product.moderationStatus);
  const moderation = moderationLabel(product.moderationStatus);
  const isDraft = product.status === 'draft';
  const selling = product.status === 'active';

  async function toggle(next: boolean) {
    if (!online) return setError(OFFLINE_ROW);
    setBusy(true);
    setError(null);
    try {
      await (next ? catalogApi.resume(storeId, product.id) : catalogApi.pause(storeId, product.id));
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show(next ? `${product.name} voltou a ser vendido.` : `${product.name} pausada.`, {
        action: {
          label: 'Desfazer',
          onAction: () => {
            void (next ? catalogApi.pause(storeId, product.id) : catalogApi.resume(storeId, product.id)).then(() => client.invalidateQueries({ queryKey: catalogKeys.all }));
          },
        },
      });
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === 'PRODUCT_MODERATED' ? catalogErrorMessage(caught) : caught instanceof ApiError && caught.isNetwork ? OFFLINE_ROW : 'Não foi possível salvar. Tentar de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={s.productRow} data-testid={T(`row-${product.id}`)}>
      <td className={s.checkCell} data-primary>
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Selecionar ${product.name}`} data-testid={T(`select-${product.id}`)} />
      </td>
      <td data-primary>
        <div className={s.photoCell}>
          <Thumb cover={product.cover} />
          <div style={{ minWidth: 0 }}>
            <Link href={asRoute(`/lojista/produtos/${product.id}`)} className={cx(s.productName, 'wb-text-body-strong')} data-testid={T(`open-${product.id}`)}>
              {product.name}
            </Link>
            <div className={s.badges}>
              {isDraft ? <Badge tone="neutral">Rascunho</Badge> : null}
              {moderation ? <Badge tone={moderated ? 'danger' : 'warning'}>{moderation}</Badge> : null}
              {product.soldOut && !isDraft ? <Badge tone="danger">Esgotado</Badge> : product.low ? <Badge tone="warning" icon={<Warning size={16} weight="fill" aria-hidden="true" />} testId={T(`row-${product.id}-low`)}>Baixo</Badge> : null}
              {updated ? <Badge tone="success" icon={<Check size={16} aria-hidden="true" />}>Atualizado</Badge> : null}
            </div>
          </div>
        </div>
      </td>
      <td data-label="Preço" className={cx('wb-text-body', s.priceCell)}>{priceText(product)}</td>
      <td data-label="Estoque" className={s.stockCell}>
        {isDraft && product.availableTotal === 0 ? (
          <span className={ui.muted}>Sem estoque definido</span>
        ) : product.variantCount > 1 ? (
          <button type="button" className={s.linkButton} onClick={() => setSheet(true)} data-testid={T(`row-${product.id}-stock-open`)}>
            {stockLabel(product)}
          </button>
        ) : (
          <StockStepper storeId={storeId} product={product} onError={setError} />
        )}
      </td>
      <td data-label="Status" className={s.statusCell}>
        {isDraft ? (
          <Link href={asRoute(`/lojista/produtos/novo/${product.id}`)} className={s.productName}>Continuar cadastro</Link>
        ) : (
          <Switch checked={selling} label={product.name} onText="Vendendo" offText="Pausado" busy={busy} disabled={moderated || product.status === 'archived'} onChange={(next) => void toggle(next)} testId={T(`row-${product.id}-switch`)} />
        )}
        {error ? (
          <p className={cx('wb-text-caption', s.rowError)} role="alert" data-testid={T(`row-${product.id}-error`)}>
            {error}
          </p>
        ) : null}
      </td>
      <td className={s.actionsCell}>
        <Link href={asRoute(`/lojista/produtos/${product.id}`)} className={cx(s.productName, s.editLink)} aria-label={`Editar ${product.name}`}>Editar</Link>
        {!isDraft ? (
          <>
            {/* Computador: "Duplicar" ao lado de "Editar". Celular: no menu da linha, para a linha não passar de ~100 px (V8.7). */}
            <button type="button" className={cx(s.linkButton, s.dupInline)} onClick={() => void dup.duplicate(product.id)} aria-label={`Duplicar ${product.name}`} aria-busy={dup.busyId === product.id || undefined} data-testid={T(`row-${product.id}-duplicate`)}>
              {dup.busyId === product.id ? 'Duplicando…' : 'Duplicar'}
            </button>
            <span className={s.rowMenu}>
              <ActionMenu
                label={`Mais ações de ${product.name}`}
                align="start"
                busy={dup.busyId === product.id}
                actions={[{ label: 'Duplicar', onSelect: () => void dup.duplicate(product.id), testId: T(`row-${product.id}-duplicate-menu`) }]}
                testId={T(`row-${product.id}-more`)}
              />
            </span>
          </>
        ) : null}
        {dup.error ? <p className={cx('wb-text-caption', s.rowError)} role="alert" data-testid={T(`row-${product.id}-duplicate-error`)}>{dup.error}</p> : null}
        {sheet ? <StockSheet storeId={storeId} product={product} onClose={() => setSheet(false)} /> : null}
      </td>
    </tr>
  );
}

/** Estoque de produto sem variação: − e + na linha, com envio agrupado depois de 600 ms e "Salvando…"/"Salvo". */
function StockStepper({ storeId, product, onError }: { storeId: string; product: ProductSummary; onError: (message: string | null) => void }) {
  const client = useQueryClient();
  const online = useOnline();
  const [override, setOverride] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const pending = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = override ?? product.availableTotal;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  async function flush() {
    const delta = pending.current;
    pending.current = 0;
    if (delta === 0) return;
    setState('saving');
    try {
      const detail = await client.fetchQuery({ queryKey: catalogKeys.product(storeId, product.id), queryFn: () => catalogApi.get(storeId, product.id), staleTime: 30_000 });
      const variant = detail.variants[0];
      if (!variant) throw new ApiError({ status: 409, code: 'NO_VARIANT', title: 'Sem variação' });
      await catalogApi.adjustStock(storeId, product.id, variant.id, { delta });
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      setOverride(null);
      setState('saved');
      savedTimer.current = setTimeout(() => setState('idle'), 2000);
    } catch (caught) {
      setOverride(null);
      setState('idle');
      void client.invalidateQueries({ queryKey: catalogKeys.product(storeId, product.id) });
      onError(caught instanceof ApiError && caught.code === 'STOCK_BELOW_RESERVED' ? catalogErrorMessage(caught) : caught instanceof ApiError && caught.isNetwork ? OFFLINE_ROW : 'Não foi possível salvar. Tentar de novo.');
    }
  }

  function change(delta: number) {
    if (!online) return onError(OFFLINE_ROW);
    onError(null);
    const next = Math.min(MAX_STOCK, Math.max(0, shown + delta));
    if (next === shown) return;
    pending.current += next - shown;
    setOverride(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  return (
    <span className={s.stepper} role="group" aria-label={`Estoque de ${product.name}`}>
      <button type="button" className={ui.iconButton} aria-label={`Diminuir estoque de ${product.name}`} disabled={shown <= 0} onClick={() => change(-1)} data-testid={T(`row-${product.id}-stock-minus`)}>
        <Minus size={20} aria-hidden="true" />
      </button>
      <span className={cx(s.stepperValue, 'wb-text-body-strong')} aria-live="polite" aria-label={`Estoque, ${shown}`}>
        {shown}
      </span>
      <button type="button" className={ui.iconButton} aria-label={`Aumentar estoque de ${product.name}`} onClick={() => change(1)} data-testid={T(`row-${product.id}-stock-plus`)}>
        <Plus size={20} aria-hidden="true" />
      </button>
      <span className={cx('wb-text-caption', ui.muted)} role="status">
        {state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : ''}
      </span>
    </span>
  );
}

/** Folha "Ajustar estoque" de produto com variações: 1 campo por opção e "Salvar estoque". */
function StockSheet({ storeId, product, onClose }: { storeId: string; product: ProductSummary; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const detail = useQuery({ queryKey: catalogKeys.product(storeId, product.id), queryFn: () => catalogApi.get(storeId, product.id) });
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variants = detail.data?.variants ?? [];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const variant of variants) {
        const next = edited[variant.id];
        if (next === undefined || next === variant.stock) continue;
        await catalogApi.adjustStock(storeId, product.id, variant.id, { set: next });
      }
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show('Estoque salvo.');
      onClose();
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não foi possível salvar. Tentar de novo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      title="Ajustar estoque"
      onClose={onClose}
      locked={saving}
      testId={T(`stock-sheet-${product.id}`)}
      actions={
        <>
          <Button onClick={() => void save()} loading={saving} loadingLabel="Salvando…" disabled={detail.isPending || detail.isError} data-testid={T('stock-sheet-submit')}>
            Salvar estoque
          </Button>
          <Button variant="text" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>{product.name}</p>
      {detail.isPending ? <SkeletonRows rows={3} height={48} label="Carregando as opções" /> : null}
      {detail.isError ? <p role="alert" className={s.rowError}>Não conseguimos carregar agora. Tente de novo em instantes.</p> : null}
      <ul className={s.grid}>
        {variants.map((variant) => {
          const label = Object.values(variant.attributes).join(' · ');
          const value = edited[variant.id] ?? variant.stock;
          return (
            <li key={variant.id} className={s.gridHead}>
              <span className="wb-text-body">{label}</span>
              <span className={s.stepper}>
                <button type="button" className={ui.iconButton} aria-label={`Diminuir estoque de ${label}`} disabled={value <= 0} onClick={() => setEdited({ ...edited, [variant.id]: value - 1 })}>
                  <Minus size={20} aria-hidden="true" />
                </button>
                <span className={cx(s.stepperValue, 'wb-text-body-strong')} aria-label={`Estoque de ${label}, ${value}`}>{value}</span>
                <button type="button" className={ui.iconButton} aria-label={`Aumentar estoque de ${label}`} onClick={() => setEdited({ ...edited, [variant.id]: Math.min(MAX_STOCK, value + 1) })}>
                  <Plus size={20} aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error ? <p className={s.rowError} role="alert">{error}</p> : null}
    </Dialog>
  );
}
