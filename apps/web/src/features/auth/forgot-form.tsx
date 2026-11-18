'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Banner, Button, NewPasswordPair, OtpInput, TextField, ui } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { ltid, tid } from '@/lib/testid';
import { AuthCard } from './auth-card';
import s from './auth.module.css';

/**
 * Esqueci a senha do admin [HIPÓTESE Z-3]: e-mail, código recebido e nova senha. Redefinir NÃO abre sessão para admin;
 * o próximo login continua exigindo o código do autenticador, então o 2º fator nunca é dispensado.
 */
export function ForgotForm({ area = 'admin' }: { area?: 'admin' | 'lojista' }) {
  const router = useRouter();
  const t = area === 'admin' ? tid : ltid;
  const loginHref = `/${area}/entrar` as const;
  const [stage, setStage] = useState<'email' | 'reset' | 'mfa' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [factor, setFactor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return setFieldError('Digite seu e-mail.');
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      await apiRequest(area, 'auth/password/forgot', { method: 'POST', body: { email: email.trim() } });
      setStage('reset');
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 429 ? 'Muitas tentativas. Espere alguns minutos e tente de novo.' : 'Não foi possível enviar o código. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (code.length < 6) return setError('Digite o código de 6 dígitos.');
    if (password.length < 8) return setFieldError('Senha fraca. Use 8 caracteres ou mais, com letras e números.');
    if (password !== confirm) return setFieldError('As senhas não são iguais.');
    setFieldError(undefined);
    setBusy(true);
    try {
      const result = await apiRequest<{ mfaRequired?: boolean } | undefined>(area, 'auth/password/reset', { method: 'POST', body: { email: email.trim(), code, newPassword: password } });
      if (area === 'lojista') return router.replace('/lojista');
      // Admin com TOTP: o código do e-mail já valeu; falta o 2º fator (o ticket fica em cookie HttpOnly, SEC-095/115).
      setStage(result?.mfaRequired ? 'mfa' : 'done');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) setFieldError(caught.fieldMessage('newPassword') ?? caught.detail ?? 'Essa senha é muito comum. Escolha outra.');
      else setError('Código incorreto ou vencido.');
    } finally {
      setBusy(false);
    }
  }

  async function completeReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (factor.trim().length < 6) return setError('Digite o código do autenticador ou um código de recuperação.');
    setBusy(true);
    try {
      await apiRequest(area, 'auth/password/reset/complete', { method: 'POST', body: { totpCode: factor.trim(), newPassword: password } });
      setStage('done');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) setError('Muitas tentativas. Espere alguns minutos e tente de novo.');
      else if (caught instanceof ApiError && caught.status === 422) setError(caught.fieldMessage('newPassword') ?? caught.detail ?? 'Essa senha é muito comum. Volte e escolha outra.');
      else setError('Código incorreto ou vencido.');
      setFactor('');
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'mfa') {
    return (
      <AuthCard area={area} title="Confirme que é você">
        <form onSubmit={completeReset} className={ui.stack} noValidate>
          <p className="wb-text-body" style={{ margin: 0 }}>O código do e-mail está certo. Digite o código de 6 dígitos do seu app autenticador ou um código de recuperação.</p>
          <TextField label="Código do autenticador ou de recuperação" value={factor} onChange={(e) => setFactor(e.target.value)} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} data-testid={t('forgot', 'factor-input')} />
          {error ? <Banner tone="danger" testId={t('forgot', 'factor-error')}>{error}</Banner> : null}
          <Button type="submit" size="lg" loading={busy} loadingLabel="Salvando…" data-testid={t('forgot', 'factor-submit')}>Redefinir senha</Button>
        </form>
      </AuthCard>
    );
  }

  if (stage === 'done') {
    return (
      <AuthCard area={area} title="Senha redefinida">
        <p className="wb-text-body" style={{ margin: 0 }}>Entre com a nova senha. Ainda vamos pedir o código do seu app autenticador.</p>
        <Link href={loginHref} className={s.link}>Ir para o login</Link>
      </AuthCard>
    );
  }

  if (stage === 'reset') {
    return (
      <AuthCard area={area} title="Crie uma nova senha">
        <form onSubmit={reset} className={ui.stack} noValidate>
          <p className="wb-text-body" style={{ margin: 0 }}>Se o e-mail estiver cadastrado, enviamos um código de 6 dígitos.</p>
          <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} testId={t('forgot', 'code-input')} label="Código recebido por e-mail" />
          <NewPasswordPair password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} passwordError={fieldError} testIds={{ password: t('forgot', 'password-input'), confirm: t('forgot', 'password-confirm-input'), toggle: t('forgot', 'password-toggle') }} passwordLabel="Nova senha" />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button type="submit" size="lg" loading={busy} loadingLabel="Salvando…" data-testid={t('forgot', 'submit')}>Redefinir senha</Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard area={area} title="Esqueci a senha">
      <form onSubmit={sendEmail} className={ui.stack} noValidate>
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" error={fieldError} data-testid={t('forgot', 'email-input')} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Enviando…" data-testid={t('forgot', 'email-submit')}>Enviar código</Button>
        <Link href={loginHref} className={s.link}>Voltar</Link>
      </form>
    </AuthCard>
  );
}
