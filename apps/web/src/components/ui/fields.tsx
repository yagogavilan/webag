'use client';

import { WarningCircle } from '@phosphor-icons/react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx';
import s from './ui.module.css';

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  /** Conta de caracteres: "12 de 30". */
  counter?: { value: number; max: number };
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Rótulo sempre visível acima, ajuda e erro abaixo (design-system.md §3.1). */
export function FieldShell({ label, hint, error, counter, children, className }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={id} className={cx('wb-text-caption-strong', s.label)}>
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <span id={hintId} className={cx('wb-text-caption', s.hint)}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={cx('wb-text-caption', s.error)}>
          <WarningCircle size={16} weight="fill" aria-hidden="true" />
          {error}
        </span>
      ) : null}
      {counter ? (
        <span className={cx('wb-text-caption', s.counter)} aria-hidden="true">
          {counter.value} de {counter.max}
        </span>
      ) : null}
    </div>
  );
}

type BaseInput = Omit<ComponentProps<'input'>, 'id' | 'className'>;

export function TextField({ label, hint, error, counter, className, ...input }: BaseInput & Omit<FieldShellProps, 'children'>) {
  return (
    <FieldShell label={label} hint={hint} error={error} counter={counter} className={className}>
      {({ id, describedBy, invalid }) => <input {...input} id={id} className={s.control} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, counter, className, ...input }: Omit<ComponentProps<'textarea'>, 'id' | 'className'> & Omit<FieldShellProps, 'children'>) {
  return (
    <FieldShell label={label} hint={hint} error={error} counter={counter} className={className}>
      {({ id, describedBy, invalid }) => <textarea {...input} id={id} className={s.control} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, className, children, ...input }: Omit<ComponentProps<'select'>, 'id' | 'className'> & Omit<FieldShellProps, 'children' | 'counter'>) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {({ id, describedBy, invalid }) => (
        <select {...input} id={id} className={s.control} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function CheckboxField({ label, error, ...input }: Omit<ComponentProps<'input'>, 'type' | 'id' | 'className'> & { label: ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.checkRow} htmlFor={id}>
        <input {...input} id={id} type="checkbox" aria-invalid={Boolean(error) || undefined} />
        <span className="wb-text-body">{label}</span>
      </label>
      {error ? (
        <span className={cx('wb-text-caption', s.error)}>
          <WarningCircle size={16} weight="fill" aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  testId?: string;
}

/** Rádios grandes em `fieldset` com legenda (a11y). */
export function RadioCards<T extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T | null; options: RadioOption<T>[]; onChange: (value: T) => void }) {
  return (
    <fieldset className={s.group}>
      <legend className={cx('wb-text-caption-strong', s.label)}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={s.radioCard}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} data-testid={option.testId} />
          <span>
            <span className="wb-text-body-strong">{option.label}</span>
            {option.description ? <span className={cx('wb-text-caption', s.hint)} style={{ display: 'block' }}>{option.description}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
