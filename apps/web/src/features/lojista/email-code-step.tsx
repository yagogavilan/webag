'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, Dialog, OtpInput, PasswordField, TextField, ui, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { merchantApi } from '@/lib/api/lojista';
import { isValidEmail } from '@/lib/br/mask';
import { ltid } from '@/lib/testid';
import { useCountdown } from '@/lib/use-countdown';
import { useOnline } from '@/lib/use-online';
import s from './lojista.module.css';

const RESEND_SECONDS = 60;
const ATTEMPTS = 5;

interface Props {
  email: string;
  onVerified: () => void;
  onEmailChanged: (email: string) => void;
}

/**
 * L2: confirmar o e-mail com o código de 6 dígitos (onda-1b E4, finalidade `signup_verify`). Verifica sozinho no 6º dígito;
 * não há botão de enviar. O contador de reenvio só é anunciado ao leitor de tela quando libera.
 */
export function EmailCodeStep({ email, onVerified, onEmailChanged }: Props) {
  const toast = useToast();
  const online = useOnline();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(ATTEMPTS);
  const [locked, setLocked] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const countdown = useCountdown(RESEND_SECONDS);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function verify(value: string) {
    if (!online) return setError('Sem conexão. Conecte-se para confirmar.');
    setBusy(true);
    setError(null);
    try {
      await merchantApi.verifyEmail(value);
      onVerified();
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.code === 'EMAIL_ALREADY_VERIFIED') return onVerified();
      if (caught instanceof ApiError && caught.isNetwork) return setError('Sem conexão. Conecte-se para confirmar.');
      if (caught instanceof ApiError && caught.code === 'CODE_EXPIRED') return fail('Código vencido. Peça outro.');
      if (caught instanceof ApiError && (caught.code === 'CODE_INVALID' || caught.status === 400 || caught.status === 401)) {
        const remaining = left - 1;
        setLeft(remaining);
        if (remaining <= 0) {
          setLocked(true);
          return fail('Muitas tentativas. Peça um novo código.');
        }
        return fail(`Código incorreto. Restam ${remaining} ${remaining === 1 ? 'tentativa' : 'tentativas'}.`);
      }
      if (caught instanceof ApiError && caught.status === 429) {
        setLocked(true);
        return fail('Muitas tentativas. Peça um novo código.');
      }
      setError('Não conseguimos verificar. Tente de novo.');
    }
  }

  /** Erro de código: as caixas limpam e o foco volta à primeira (onda-2 L2). */
  function fail(message: string) {
    setError(message);
    setCode('');
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-testid="${ltid('signup', 'otp-input')}-0"]`)?.focus());
  }

  async function resend() {
    setLimit(null);
    try {
      await merchantApi.resendEmailCode();
      countdown.restart();
      setLeft(ATTEMPTS);
      setLocked(false);
      setError(null);
      setCode('');
      toast.show('Enviamos um novo código.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) {
        const minutes = caught.retryAfterSeconds ? Math.max(1, Math.ceil(caught.retryAfterSeconds / 60)) : null;
        return setLimit(minutes ? `Você pediu muitos códigos. Tente de novo em ${minutes} minutos.` : 'Você pediu muitos códigos. Tente de novo mais tarde.');
      }
      if (caught instanceof ApiError && caught.isNetwork) return setLimit('Sem conexão. Conecte-se para pedir outro código.');
      setLimit('Não foi possível enviar o código. Tente de novo.');
    }
  }

  const canResend = countdown.seconds === 0;

  return (
    <div className={s.formCol}>
      <h1 ref={heading} tabIndex={-1} className={`wb-text-title1 ${s.title}`}>
        Confirme seu e-mail
      </h1>
      <p className="wb-text-body" style={{ margin: 0 }}>
        Enviamos um código de 6 dígitos para {email}.
      </p>
      <OtpInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} invalid={Boolean(error)} disabled={busy || locked} autoFocus testId={ltid('signup', 'otp-input')} />
      {error ? (
        <p className="wb-text-caption" role="alert" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }} data-testid={ltid('signup', 'otp-error')}>
          {error}
        </p>
      ) : null}
      {busy ? (
        <p className="wb-text-caption" role="status" style={{ margin: 0 }}>
          Verificando…
        </p>
      ) : null}
      <p className={`wb-text-caption ${ui.muted}`} style={{ margin: 0 }}>
        O código vale por 10 minutos.
      </p>
      {locked ? (
        <Button onClick={() => void resend()} data-testid={ltid('signup', 'otp-resend-new')}>
          Enviar novo código
        </Button>
      ) : canResend ? (
        <button type="button" className={`wb-text-body ${s.signupLink}`} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer', justifyContent: 'flex-start' }} onClick={() => void resend()} data-testid={ltid('signup', 'otp-resend')}>
          Reenviar código
        </button>
      ) : (
        <span className={`wb-text-caption ${ui.muted}`} data-testid={ltid('signup', 'otp-resend')} aria-hidden="true">
          Reenviar código em {countdown.label}
        </span>
      )}
      <span className={ui.srOnly} role="status" aria-live="polite">
        {canResend ? 'Você já pode reenviar o código.' : ''}
      </span>
      {limit ? <Banner tone="warning">{limit}</Banner> : null}
      <button type="button" className={`wb-text-body ${s.signupLink}`} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer', justifyContent: 'flex-start' }} onClick={() => setChanging(true)} data-testid={ltid('signup', 'otp-change-email')}>
        Trocar e-mail
      </button>
      {changing ? (
        <ChangeEmailDialog
          onClose={() => setChanging(false)}
          onChanged={(next) => {
            setChanging(false);
            countdown.restart();
            setLeft(ATTEMPTS);
            setLocked(false);
            setCode('');
            setError(null);
            onEmailChanged(next);
          }}
        />
      ) : null}
    </div>
  );
}

function ChangeEmailDialog({ onClose, onChanged }: { onClose: () => void; onChanged: (email: string) => void }) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!isValidEmail(newEmail)) next.email = 'Confira o e-mail.';
    if (!password) next.password = 'Digite sua senha.';
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    try {
      await apiRequest('lojista', 'auth/email/correct', { method: 'POST', body: { newEmail: newEmail.trim(), password } });
      onChanged(newEmail.trim());
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.code === 'EMAIL_ALREADY_REGISTERED') return setErrors({ email: 'Esse e-mail já tem conta Webag.' });
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) return setErrors({ password: 'Senha incorreta.' });
      setErrors({ form: caught instanceof ApiError && caught.isNetwork ? 'Sem conexão. Conecte-se para trocar o e-mail.' : 'Não foi possível trocar o e-mail. Tente de novo.' });
    }
  }

  return (
    <Dialog title="Trocar e-mail" onClose={onClose} locked={busy} testId={ltid('signup', 'change-email-dialog')}>
      <form onSubmit={submit} className={ui.stack} noValidate>
        <TextField label="Novo e-mail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} error={errors.email} data-testid={ltid('signup', 'change-email-input')} />
        <PasswordField label="Sua senha" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
        {errors.form ? <Banner tone="danger">{errors.form}</Banner> : null}
        <Button type="submit" loading={busy} loadingLabel="Trocando…" data-testid={ltid('signup', 'change-email-submit')}>
          Trocar e-mail
        </Button>
        <Button variant="text" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
      </form>
    </Dialog>
  );
}
