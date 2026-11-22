'use client';

import { Check, Plus } from '@phosphor-icons/react';
import { useId, useMemo, useState } from 'react';
import { Button, cx } from '@/components/ui';
import type { CategoryTemplate } from '@/lib/api/catalog';
import { MAX_STOCK } from '@/lib/catalog/helpers';
import { COLOR_SHORTCUTS, COLOR_SWATCH, SIZE_SHORTCUTS, kindOf, newAttr, norm, rowLabel, syncRows, totalStock, type AttrDef, type GridRow } from '@/lib/catalog/variants';
import { ltid } from '@/lib/testid';
import q from './quick.module.css';

const T = (id: string) => ltid('rapido', id);

export interface GradeState {
  attrs: AttrDef[];
  rows: GridRow[];
  excluded: string[];
}

export const EMPTY_GRADE: GradeState = { attrs: [], rows: [], excluded: [] };

/** Atributos que o modelo da categoria sugere (WB-375): nenhum valor vem marcado, para não inventar estoque (spec §4). */
export function suggestedAttributes(template: CategoryTemplate | null): { name: string; values: string[] }[] {
  const fromTemplate = (template?.attributes ?? []).slice(0, 3).map((a) => ({ name: a.name, values: [...a.values] }));
  if (fromTemplate.length === 0) return [{ name: 'Tamanho', values: [...SIZE_SHORTCUTS] }, { name: 'Cor', values: [...COLOR_SHORTCUTS] }];
  return fromTemplate.map((a) => {
    if (a.values.length > 0) return a;
    const kind = kindOf(a.name);
    return kind === 'color' ? { ...a, values: [...COLOR_SHORTCUTS] } : kind === 'size' ? { ...a, values: [...SIZE_SHORTCUTS] } : a;
  });
}

interface Props {
  template: CategoryTemplate | null;
  variantsMax: number;
  state: GradeState;
  onChange: (next: GradeState) => void;
  /** Mensagem de erro geral da grade (limite, sem estoque válido). */
  error?: string | undefined;
}

/**
 * Grade tamanho x cor (WB-374, RN-Q5; spec §4): chips por atributo vindos do modelo da categoria, uma linha por combinação com
 * estoque, "Preencher todos com N" e totais em região viva. Combinação repetida e limite são recusados com texto.
 * Preço por combinação ("Outro preço") e "Duplicar variação" ficam para depois (corte 4 da DEC-126).
 */
export function QuickGrade({ template, variantsMax, state, onChange, error }: Props) {
  const suggested = useMemo(() => suggestedAttributes(template), [template]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<string | null>(null);
  const [fillText, setFillText] = useState('1');
  const fillId = useId();

  function selectedOf(name: string): string[] {
    return state.attrs.find((a) => norm(a.name) === norm(name))?.values ?? [];
  }

  function apply(name: string, values: string[]) {
    const others = state.attrs.filter((a) => norm(a.name) !== norm(name));
    const kind = kindOf(name);
    const existing = state.attrs.find((a) => norm(a.name) === norm(name));
    const attr: AttrDef = existing ? { ...existing, values } : { ...newAttr(kind, name), name, values };
    // Mantém a ordem do modelo (tamanho antes de cor) para o rótulo "M · Preto".
    const merged = [...others, attr].filter((a) => a.values.length > 0).sort((a, b) => suggested.findIndex((s) => norm(s.name) === norm(a.name)) - suggested.findIndex((s) => norm(s.name) === norm(b.name)));
    onChange({ attrs: merged, rows: syncRows(merged, state.rows, 0, new Set(state.excluded)), excluded: state.excluded });
  }

  function toggle(name: string, value: string) {
    setDup(null);
    const current = selectedOf(name);
    const has = current.some((v) => norm(v) === norm(value));
    apply(name, has ? current.filter((v) => norm(v) !== norm(value)) : [...current, value]);
  }

  function addCustom(name: string) {
    const value = (custom[name] ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (value === '') return;
    if (selectedOf(name).some((v) => norm(v) === norm(value))) {
      setDup('Essa combinação já existe');
      return;
    }
    setDup(null);
    setCustom((c) => ({ ...c, [name]: '' }));
    apply(name, [...selectedOf(name), value]);
  }

  function setStock(key: string, text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 5);
    const value = digits === '' ? 0 : Math.min(MAX_STOCK, Number(digits));
    onChange({ ...state, rows: state.rows.map((row) => (row.key === key ? { ...row, stock: value } : row)) });
  }

  function fillAll() {
    const digits = fillText.replace(/\D/g, '').slice(0, 5);
    const value = digits === '' ? 0 : Math.min(MAX_STOCK, Number(digits));
    onChange({ ...state, rows: state.rows.map((row) => ({ ...row, stock: value })) });
  }

  const order = state.attrs.map((a) => a.name);
  const tooMany = state.rows.length > variantsMax;
  const total = totalStock(state.rows);

  return (
    <div className={q.fieldRow} data-testid={T('grade')}>
      {template?.sizeChartHint ? <p className={cx('wb-text-body', q.help)} data-testid={T('size-chart-hint')}>A tabela de medidas ajuda o cliente a acertar o tamanho. Adicione depois.</p> : null}
      {suggested.map((attr) => {
        const selected = selectedOf(attr.name);
        const extra = selected.filter((v) => !attr.values.some((o) => norm(o) === norm(v)));
        const options = [...attr.values, ...extra];
        const isColor = kindOf(attr.name) === 'color';
        const groupId = `${fillId}-${norm(attr.name)}`;
        return (
          <div key={attr.name} className={q.fieldRow}>
            <span className="wb-text-body-strong" id={groupId}>{attr.name}</span>
            <div className={q.chips} role="group" aria-labelledby={groupId}>
              {options.map((value) => {
                const on = selected.some((v) => norm(v) === norm(value));
                return (
                  <button
                    key={value}
                    type="button"
                    className={cx('wb-text-body')}
                    style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 var(--wb-space-3)', borderRadius: 'var(--wb-radius-md)', border: '1px solid var(--wb-color-border-strong)', background: on ? 'var(--wb-color-surface-ink)' : 'var(--wb-color-surface-card)', color: on ? 'var(--wb-color-text-inverse)' : 'var(--wb-color-text-primary)', cursor: 'pointer' }}
                    aria-pressed={on}
                    onClick={() => toggle(attr.name, value)}
                    data-testid={T(`chip-${norm(attr.name)}-${norm(value).replace(/\s+/g, '-')}`)}
                  >
                    {isColor && COLOR_SWATCH[norm(value)] ? <span className={q.swatch} style={{ background: COLOR_SWATCH[norm(value)] }} aria-hidden="true" /> : null}
                    {on ? <Check size={16} aria-hidden="true" /> : null}
                    {value}
                  </button>
                );
              })}
            </div>
            <div className={q.fillAll}>
              <label className="wb-text-caption-strong" htmlFor={`${groupId}-custom`}>{isColor ? 'Outra cor' : `Outro valor de ${attr.name.toLowerCase()}`}</label>
              <input
                id={`${groupId}-custom`}
                className="wb-text-body"
                style={{ minHeight: 44, padding: '0 var(--wb-space-3)', borderRadius: 'var(--wb-radius-md)', border: '1px solid var(--wb-color-border-strong)' }}
                value={custom[attr.name] ?? ''}
                maxLength={40}
                onChange={(event) => setCustom((c) => ({ ...c, [attr.name]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addCustom(attr.name);
                  }
                }}
                data-testid={T(`custom-${norm(attr.name)}`)}
              />
              <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => addCustom(attr.name)} data-testid={T(`custom-${norm(attr.name)}-add`)}>
                Adicionar
              </Button>
            </div>
          </div>
        );
      })}

      {dup ? <p role="alert" className={cx('wb-text-body', q.rowErr)} data-testid={T('grade-dup')}>{dup}</p> : null}

      {state.rows.length > 0 ? (
        <>
          <div className={q.fillAll}>
            <label className="wb-text-caption-strong" htmlFor={`${fillId}-fill`}>Preencher todos com</label>
            <input
              id={`${fillId}-fill`}
              inputMode="numeric"
              className="wb-text-body"
              style={{ minHeight: 44, width: '6ch', textAlign: 'center', borderRadius: 'var(--wb-radius-md)', border: '1px solid var(--wb-color-border-strong)' }}
              value={fillText}
              onChange={(event) => setFillText(event.target.value.replace(/\D/g, '').slice(0, 5))}
              data-testid={T('fill-value')}
            />
            <Button variant="secondary" size="sm" onClick={fillAll} data-testid={T('fill-apply')}>Aplicar</Button>
          </div>
          <ul className={q.gradeRows} aria-label="Combinações e estoque">
            {state.rows.map((row) => {
              const label = rowLabel(row.attributes, order);
              return (
                <li key={row.key} className={q.gradeRow} data-testid={T(`row-${norm(label).replace(/\s+/g, '-')}`)}>
                  <label className="wb-text-body-strong" htmlFor={`${fillId}-${row.key}`}>{label}</label>
                  <input
                    id={`${fillId}-${row.key}`}
                    inputMode="numeric"
                    aria-label={`Estoque de ${label}`}
                    className="wb-text-body"
                    style={{ minHeight: 44, width: '7ch', textAlign: 'center', borderRadius: 'var(--wb-radius-md)', border: '1px solid var(--wb-color-border-strong)' }}
                    value={String(row.stock)}
                    onChange={(event) => setStock(row.key, event.target.value)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <p className="wb-text-body-strong" role="status" aria-live="polite" data-testid={T('grade-total')}>
        {state.rows.length === 0 ? 'Toque nos tamanhos e cores que você tem.' : `${state.rows.length} ${state.rows.length === 1 ? 'combinação' : 'combinações'} · ${total.toLocaleString('pt-BR')} ${total === 1 ? 'unidade' : 'unidades'}`}
      </p>
      {tooMany ? <p role="alert" className={cx('wb-text-body', q.rowErr)} data-testid={T('grade-limit')}>Máximo de {variantsMax} combinações. Tire alguma opção.</p> : null}
      {error ? <p role="alert" className={cx('wb-text-body', q.rowErr)} data-testid={T('grade-error')}>{error}</p> : null}
      <p className={cx('wb-text-caption', q.help)}>Cada cor com foto própria? Publique e use Duplicar.</p>
    </div>
  );
}
