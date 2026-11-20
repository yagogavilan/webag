'use client';

import { CheckCircle, Eye, EyeSlash } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { FieldShell } from './fields';
import { cx } from './cx';
import s from './ui.module.css';

export type Strength = 'weak' | 'medium' | 'strong';

/** Medidor simples só para orientar quem digita; a política de verdade (tamanho e senhas comuns) é da API. */
export function passwordStrength(password: string): Strength {
  if (password.length < 8) return 'weak';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 12 && classes >= 3) return 'strong';
  if (classes >= 2) return 'medium';
  return 'weak';
}

const STRENGTH_LABEL: Record<Strength, string> = { weak: 'Fraca', medium: 'Média', strong: 'Forte' };
const STRENGTH_BARS: Record<Strength, number> = { weak: 1, medium: 2, strong: 4 };

interface SingleProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  autoComplete: 'current-password' | 'new-password';
  testIds?: { input?: string; toggle?: string };
  visible?: boolean;
  onToggleVisible?: () => void;
  hint?: string;
}

/** Campo de senha com um olho. Colar e gerenciador de senhas permitidos (DEC-012). */
export function PasswordField({ label, value, onChange, error, autoComplete, testIds, visible, onToggleVisible, hint }: SingleProps) {
  const [own, setOwn] = useState(false);
  const shown = visible ?? own;
  const toggle = onToggleVisible ?? (() => setOwn((v) => !v));
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <div className={s.inputRow}>
          <input
            id={id}
            className={s.control}
            type={shown ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete={autoComplete}
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            data-testid={testIds?.input}
          />
          <button type="button" className={s.iconButton} onClick={toggle} aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={shown} data-testid={testIds?.toggle}>
            {shown ? <EyeSlash size={24} aria-hidden="true" /> : <Eye size={24} aria-hidden="true" />}
          </button>
        </div>
      )}
    </FieldShell>
  );
}

interface PairProps {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  passwordError?: string | undefined;
  confirmError?: string | undefined;
  testIds?: { password?: string; confirm?: string; toggle?: string };
  passwordLabel?: string;
}

/** Senha + confirmação com um único olho, medidor em texto e mensagem de igualdade (DEC-012, onda-1b §0.3). */
export function NewPasswordPair({ password, confirm, onPassword, onConfirm, passwordError, confirmError, testIds, passwordLabel = 'Senha' }: PairProps) {
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);
  const meterId = useId();
  const strength = passwordStrength(password);
  const showMatch = confirm.length > 0 && (touched || confirm.length === password.length);
  const mismatch = showMatch && confirm !== password;
  const match = showMatch && confirm === password;

  return (
    <>
      <div className={s.field}>
        <PasswordField label={passwordLabel} value={password} onChange={onPassword} error={passwordError} autoComplete="new-password" visible={visible} onToggleVisible={() => setVisible((v) => !v)} testIds={{ input: testIds?.password, toggle: testIds?.toggle }} />
        {password ? (
          <div className={s.meter} id={meterId} data-testid="password-meter">
            {[1, 2, 3, 4].map((bar) => (
              <span key={bar} className={cx(s.meterBar, bar <= STRENGTH_BARS[strength] && s.meterBarOn)} aria-hidden="true" />
            ))}
            <span className="wb-text-caption">Força da senha: {STRENGTH_LABEL[strength]}</span>
          </div>
        ) : null}
      </div>
      <div onBlur={() => setTouched(true)}>
        <PasswordField label="Confirmar senha" value={confirm} onChange={onConfirm} error={confirmError ?? (mismatch ? 'As senhas não são iguais.' : undefined)} autoComplete="new-password" visible={visible} onToggleVisible={() => setVisible((v) => !v)} testIds={{ input: testIds?.confirm, toggle: testIds?.toggle ? `${testIds.toggle}-confirm` : undefined }} />
        {match ? (
          <span className={cx('wb-text-caption', s.hint)} role="status" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <CheckCircle size={16} weight="fill" aria-hidden="true" /> As senhas são iguais.
          </span>
        ) : null}
      </div>
    </>
  );
}
