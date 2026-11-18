'use client';

import { useRef } from 'react';
import { cx } from './cx';
import s from './ui.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Chamado ao completar o 6º dígito (verificação automática). */
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
  testId?: string;
  autoFocus?: boolean;
  length?: number;
}

/** Seis caixas, foco automático, colar o código inteiro e preenchimento automático (`one-time-code`). */
export function OtpInput({ value, onChange, onComplete, invalid, disabled, label = 'Código de 6 dígitos', testId, autoFocus, length = 6 }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  function commit(next: string, focusIndex?: number) {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (focusIndex !== undefined) refs.current[Math.min(focusIndex, length - 1)]?.focus();
    if (clean.length === length) onComplete?.(clean);
  }

  return (
    <div role="group" aria-label={label} className={s.otp} data-testid={testId}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className={cx(s.otpBox)}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={index === 0 ? length : 1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={`Dígito ${index + 1} de ${length}`}
          aria-invalid={invalid || undefined}
          data-testid={testId ? `${testId}-${index}` : undefined}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, '');
            if (typed.length > 1) return commit(typed, typed.length);
            const next = typed ? value.slice(0, index) + typed + value.slice(index + 1) : value.slice(0, index) + value.slice(index + 1);
            commit(next, typed ? index + 1 : index);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digit && index > 0) {
              event.preventDefault();
              commit(value.slice(0, index - 1), index - 1);
            }
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
          }}
          onPaste={(event) => {
            event.preventDefault();
            commit(event.clipboardData.getData('text'), length);
          }}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
