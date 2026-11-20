'use client';

import { CaretLeft, Minus, Plus, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, TextField, cx, ui } from '@/components/ui';
import { DEFAULT_STOCK, MAX_STOCK } from '@/lib/catalog/helpers';
import {
  COLOR_SHORTCUTS,
  COLOR_SWATCH,
  SIZE_SHORTCUTS,
  newAttr,
  norm,
  rowLabel,
  syncRows,
  totalStock,
  validateGrid,
  variantsSummary,
  type AttrDef,
  type AttrKind,
  type GridRow,
} from '@/lib/catalog/variants';
import { centsFromDigits, moneyField, parseCents } from '@/lib/money';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './catalog.module.css';

const T = (id: string) => ltid('variacoes', id);
const parsePrice = (text: string): number | null => parseCents(text);

export interface VariantsState {
  attrs: AttrDef[];
  rows: GridRow[];
  excluded: string[];
}

interface Props {
  initial: VariantsState;
  /** Texto do preço do produto, para a dica "vazio = preço do produto". */
  productPriceLabel: string | null;
  /** Salva (produto existente: PUT; produto novo: guarda no formulário). Devolve a mensagem de erro ou `null`. */
  onSave: (state: VariantsState) => Promise<string | null>;
  onBack: () => void;
  saving: boolean;
}

/** Variações e estoque (K3): atributos com valores em etiquetas e grade de combinações com estoque por opção. */
export function VariantsEditor({ initial, productPriceLabel, onSave, onBack, saving }: Props) {
  const online = useOnline();
  const [attrs, setAttrs] = useState<AttrDef[]>(initial.attrs);
  const [rows, setRows] = useState<GridRow[]>(initial.rows);
  const [excluded, setExcluded] = useState<Set<string>>(new Set(initial.excluded));
  const [bulkText, setBulkText] = useState(String(DEFAULT_STOCK));
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const check = useMemo(() => validateGrid(attrs, rows, parsePrice), [attrs, rows]);
  const rowIssue = (key: string): string | undefined => check.rows.find((issue) => issue.key === key)?.message;
  const order = attrs.map((attr) => attr.name.trim());
  const allZero = rows.length > 0 && totalStock(rows) === 0;

  function regenerate(nextAttrs: AttrDef[], nextExcluded: ReadonlySet<string> = excluded, currentRows: GridRow[] = rows) {
    setAttrs(nextAttrs);
    setRows(syncRows(nextAttrs, currentRows, Number(bulkText) >= 0 && Number(bulkText) <= MAX_STOCK && bulkText.trim() !== '' ? Number(bulkText) : DEFAULT_STOCK, nextExcluded));
  }

  const addAttr = (kind: AttrKind) => {
    if (attrs.length >= 3) return;
    if (kind !== 'other' && attrs.some((attr) => attr.kind === kind)) return;
    regenerate([...attrs, newAttr(kind)]);
  };
  const removeAttr = (id: string) => regenerate(attrs.filter((attr) => attr.id !== id));
  const renameAttr = (id: string, name: string) => setAttrs(attrs.map((attr) => (attr.id === id ? { ...attr, name } : attr)));
  const addValue = (id: string, raw: string): boolean => {
    const value = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    const attr = attrs.find((item) => item.id === id);
    if (!attr || value === '') return false;
    if (attr.values.some((existing) => norm(existing) === norm(value))) return false;
    regenerate(attrs.map((item) => (item.id === id ? { ...item, values: [...item.values, value] } : item)));
    return true;
  };
  const removeValue = (id: string, value: string) => regenerate(attrs.map((attr) => (attr.id === id ? { ...attr, values: attr.values.filter((v) => v !== value) } : attr)));
  const updateRow = (key: string, patch: Partial<GridRow>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  function removeRow(key: string) {
    const next = new Set(excluded).add(key);
    setExcluded(next);
    setRows((current) => current.filter((row) => row.key !== key));
  }
  function applyBulk() {
    const value = Number(bulkText);
    if (!/^\d{1,5}$/.test(bulkText.trim()) || value > MAX_STOCK) return setError('Use só números inteiros.');
    setError(null);
    setRows((current) => current.map((row) => ({ ...row, stock: Math.max(value, row.reserved) })));
  }

  async function save() {
    setTouched(true);
    setError(null);
    if (!online) return setError('Conecte-se para salvar. Suas opções estão neste aparelho.');
    if (check.general.length > 0 || check.rows.length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-invalid="true"], [aria-invalid="true"]')?.focus());
      return;
    }
    const message = await onSave({ attrs, rows, excluded: [...excluded] });
    if (message) setError(message);
  }

  const hasAttrs = attrs.length > 0;
  return (
    <div className={ui.stack} data-testid={T('screen')}>
      <div>
        <Button variant="text" size="sm" icon={<CaretLeft size={20} aria-hidden="true" />} onClick={onBack} data-testid={T('back')}>
          Voltar ao produto
        </Button>
      </div>
      <h1 ref={heading} className="wb-text-title1" tabIndex={-1} style={{ margin: 0, outline: 'none' }}>Variações e estoque</h1>

      <section className={ui.stack} aria-labelledby="variacoes-passo-1">
        <h2 id="variacoes-passo-1" className="wb-text-title2" style={{ margin: 0 }}>1. Quais opções?</h2>
        {!hasAttrs ? <p className="wb-text-body" style={{ margin: 0 }}>Esse produto não tem opções. Ele tem um único estoque.</p> : null}
        {attrs.map((attr) => (
          <AttrBlock key={attr.id} attr={attr} onRename={(name) => renameAttr(attr.id, name)} onRemove={() => removeAttr(attr.id)} onAdd={(value) => addValue(attr.id, value)} onRemoveValue={(value) => removeValue(attr.id, value)} />
        ))}
        {attrs.length < 3 ? (
          <div className={s.shortcuts}>
            <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => addAttr('size')} disabled={attrs.some((a) => a.kind === 'size')} data-testid={T('attr-add-size')}>Tamanho</Button>
            <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => addAttr('color')} disabled={attrs.some((a) => a.kind === 'color')} data-testid={T('attr-add-color')}>Cor</Button>
            <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => addAttr('other')} data-testid={T('attr-add-other')}>Outro (dê um nome)</Button>
          </div>
        ) : null}
      </section>

      {hasAttrs ? (
        <section className={ui.stack} aria-labelledby="variacoes-passo-2">
          <h2 id="variacoes-passo-2" className="wb-text-title2" style={{ margin: 0 }}>2. Estoque</h2>
          <p className="wb-text-body-strong" style={{ margin: 0 }} data-testid={T('summary')} role="status">{variantsSummary(rows)}</p>
          {allZero ? <Banner tone="warning">Todas as opções estão esgotadas. O produto some das buscas e ofertas.</Banner> : null}
          {check.general.map((message) => (
            <Banner key={message} tone="danger">{message}</Banner>
          ))}
          <div className={s.bulkApply}>
            <TextField label="Mesmo estoque para todas" inputMode="numeric" value={bulkText} onChange={(event) => setBulkText(event.target.value.replace(/\D/g, '').slice(0, 5))} data-testid={T('bulk-stock-input')} />
            <Button variant="secondary" onClick={applyBulk} data-testid={T('bulk-stock-apply')}>Aplicar</Button>
          </div>
          <ul className={s.grid} data-testid={T('grid')}>
            {rows.map((row, index) => {
              const issue = touched ? rowIssue(row.key) : undefined;
              const label = rowLabel(row.attributes, order);
              return (
                <li key={row.key} className={cx(s.gridRow, issue && s.gridRowError)} data-testid={T(`row-${index}`)} data-invalid={issue ? 'true' : undefined} tabIndex={issue ? -1 : undefined}>
                  <div className={s.gridHead}>
                    <span className="wb-text-body-strong">{label}</span>
                    {row.stock === 0 ? <span className={ui.badge}>Esgotado</span> : null}
                    <Button variant="text" size="sm" icon={<X size={16} aria-hidden="true" />} onClick={() => removeRow(row.key)} aria-label={`Remover a opção ${label}`} data-testid={T(`row-${index}-remove`)}>Remover</Button>
                  </div>
                  <div className={s.stockStepper}>
                    <button type="button" className={ui.iconButton} aria-label={`Diminuir estoque de ${label}`} disabled={row.stock <= 0} onClick={() => updateRow(row.key, { stock: Math.max(0, row.stock - 1) })}>
                      <Minus size={20} aria-hidden="true" />
                    </button>
                    <TextField
                      label={`Estoque de ${label}`}
                      inputMode="numeric"
                      value={String(row.stock)}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, '').slice(0, 5);
                        updateRow(row.key, { stock: digits === '' ? 0 : Math.min(MAX_STOCK, Number(digits)) });
                      }}
                      data-testid={T(`row-${index}-stock`)}
                    />
                    <button type="button" className={ui.iconButton} aria-label={`Aumentar estoque de ${label}`} onClick={() => updateRow(row.key, { stock: Math.min(MAX_STOCK, row.stock + 1) })}>
                      <Plus size={20} aria-hidden="true" />
                    </button>
                  </div>
                  {row.showPrice ? (
                    <div className={s.gridFields}>
                      <TextField
                        label="Preço (R$)"
                        inputMode="numeric"
                        placeholder={productPriceLabel ?? 'Preço do produto'}
                        hint="Vazio usa o preço do produto."
                        value={row.priceText}
                        onChange={(event) => {
                          const cents = centsFromDigits(event.target.value);
                          updateRow(row.key, { priceText: cents === 0 ? '' : moneyField(cents) });
                        }}
                        data-testid={T(`row-${index}-price`)}
                      />
                      <TextField label="Código (opcional)" maxLength={40} value={row.sku} onChange={(event) => updateRow(row.key, { sku: event.target.value })} data-testid={T(`row-${index}-sku`)} />
                    </div>
                  ) : (
                    <div>
                      <button type="button" className={s.linkButton} onClick={() => updateRow(row.key, { showPrice: true })} data-testid={T(`row-${index}-price-toggle`)}>
                        Preço diferente
                      </button>
                    </div>
                  )}
                  {issue ? <p className={cx('wb-text-caption', s.rowError)} role="alert">{issue}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {error ? <Banner tone="danger" testId={T('error')}>{error}</Banner> : null}
      <div className={s.footer}>
        <div className={s.footerActions}>
          <Button size="lg" onClick={() => void save()} loading={saving} loadingLabel="Salvando…" data-testid={T('submit')}>
            Salvar variações
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttrBlock({ attr, onRename, onRemove, onAdd, onRemoveValue }: { attr: AttrDef; onRename: (name: string) => void; onRemove: () => void; onAdd: (value: string) => boolean; onRemoveValue: (value: string) => void }) {
  const [text, setText] = useState('');
  const key = attr.kind === 'other' ? 'outro' : attr.kind === 'size' ? 'tamanho' : 'cor';
  const shortcuts = attr.kind === 'size' ? SIZE_SHORTCUTS : attr.kind === 'color' ? COLOR_SHORTCUTS : [];
  const add = () => {
    if (onAdd(text)) setText('');
  };
  return (
    <div className={s.attrBlock} data-testid={T(`attr-${key}`)}>
      <div className={s.gridHead}>
        {attr.kind === 'other' ? (
          <TextField label="Nome da opção" maxLength={30} placeholder="Ex.: Material" value={attr.name} onChange={(event) => onRename(event.target.value)} data-testid={T('attr-other-name')} />
        ) : (
          <h3 className="wb-text-body-strong" style={{ margin: 0 }}>{attr.name}</h3>
        )}
        <Button variant="text" size="sm" onClick={onRemove} aria-label={`Remover o atributo ${attr.name || 'sem nome'}`} data-testid={T(`attr-${key}-remove`)}>Remover</Button>
      </div>
      {attr.values.length > 0 ? (
        <ul className={s.tags} aria-label={`Valores de ${attr.name}`}>
          {attr.values.map((value) => (
            <li key={value} className={cx(s.tag, 'wb-text-body')}>
              {attr.kind === 'color' && COLOR_SWATCH[norm(value)] ? <span className={s.swatch} style={{ background: COLOR_SWATCH[norm(value)] }} aria-hidden="true" /> : null}
              {value}
              <button type="button" aria-label={`Remover ${value}`} onClick={() => onRemoveValue(value)}>
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {shortcuts.length > 0 ? (
        <div className={s.shortcuts} role="group" aria-label={`Atalhos de ${attr.name.toLowerCase()}`}>
          {shortcuts.map((shortcut) => (
            <button key={shortcut} type="button" className={cx(ui.chip, 'wb-text-body')} aria-pressed={attr.values.some((v) => norm(v) === norm(shortcut))} onClick={() => (attr.values.some((v) => norm(v) === norm(shortcut)) ? onRemoveValue(attr.values.find((v) => norm(v) === norm(shortcut)) ?? shortcut) : onAdd(shortcut))}>
              {shortcut}
            </button>
          ))}
        </div>
      ) : null}
      <div className={s.bulkApply}>
        <TextField
          label={attr.kind === 'color' ? 'Outra cor (nome livre)' : `Adicionar valor de ${attr.name || 'opção'}`}
          maxLength={40}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          data-testid={T(`value-input-${key}`)}
        />
        <Button variant="secondary" onClick={add} data-testid={T(`value-add-${key}`)}>Adicionar</Button>
      </div>
    </div>
  );
}
