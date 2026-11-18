'use client';

import { cx, ui } from '@/components/ui';
import s from './panel.module.css';

export interface DiffRow {
  label: string;
  before: string | null;
  after: string | null;
}

/** Antes e depois: o que saiu leva "−" e o que entrou "+" ALÉM da cor; leitor de tela ouve "Campo: antes X, depois Y". */
export function DiffView({ rows, testId }: { rows: DiffRow[]; testId?: string }) {
  if (rows.length === 0) return <p className={cx('wb-text-body', ui.muted)}>Sem campos alterados.</p>;
  return (
    <ul className={s.diff} data-testid={testId} aria-label="Alterações">
      {rows.map((row) => (
        <li key={row.label} className={s.diffRow}>
          <span className={ui.srOnly}>{`${row.label}: antes ${row.before ?? 'vazio'}, depois ${row.after ?? 'vazio'}`}</span>
          <span aria-hidden="true" className={s.diffLabel}>
            <span className="wb-text-caption-strong">{row.label}</span>
          </span>
          <span aria-hidden="true" className={cx(s.diffSide, s.diffOld, 'wb-text-body')}>
            <span aria-hidden="true">−</span> {row.before ?? 'vazio'}
          </span>
          <span aria-hidden="true" className={cx(s.diffSide, s.diffNew, 'wb-text-body')}>
            <span aria-hidden="true">+</span> {row.after ?? 'vazio'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Compara dois objetos de auditoria e devolve só os campos que mudaram. */
export function diffRows(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffRow[] {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  return keys
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .map((key) => ({ label: key, before: stringify(before?.[key]), after: stringify(after?.[key]) }));
}
