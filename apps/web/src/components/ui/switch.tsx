'use client';

import { cx } from './cx';
import { Spinner } from './button';
import s from './ui.module.css';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Rótulo completo para o leitor de tela: "Caieiras". O estado em texto é anexado. */
  label: string;
  onText?: string;
  offText?: string;
  busy?: boolean;
  disabled?: boolean;
  testId?: string;
}

/** Switch 52x32 com alvo de 48 e o estado SEMPRE em texto (nunca só cor), com spinner ao salvar. */
export function Switch({ checked, onChange, label, onText = 'Ativa', offText = 'Inativa', busy, disabled, testId }: Props) {
  const stateText = busy ? 'Salvando…' : checked ? onText : offText;
  return (
    <span className={s.switchWrap}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label}, ${checked ? onText.toLowerCase() : offText.toLowerCase()}`}
        className={s.switch}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        data-testid={testId}
      />
      <span className={cx('wb-text-caption-strong', s.switchText)} aria-live="polite">
        {busy ? <Spinner /> : null}
        {stateText}
      </span>
    </span>
  );
}
