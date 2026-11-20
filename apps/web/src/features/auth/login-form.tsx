'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Banner, Button, OtpInput, PasswordField, TextField, ui } from '@/components/ui';
import { safeNext } from '@/lib/admin-access';
import { sessionRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { clockAfterSeconds } from '@/lib/format';
import { tid } from '@/lib/testid';
import { AuthCard, LinkButton } from './auth-card';
import s from './auth.module.css';
import Link from 'next/link';

type Step = 'credentials' | 'totp' | 'recovery' | 'email-code';

const MIN_WAIT_MS = 600;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * AC1 + AC3. Mensagem de login errado é uma só (e-mail inexistente e senha errada); o botão fica em
 * "Entrando…" por no mínimo 600 ms nos dois casos para o tempo não denunciar nada (onda-1b §0.2).
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const motivo = params.get('motivo');
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [blocked, setBlocked] = useState<{ title: string; text: string } | null>(null);

  async function submit(extra: { code?: string } = {}) {
    setError(null);
    setBlocked(null);
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = 'Digite seu e-mail.';
    if (!password) errors.password = 'Digite sua senha.';
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setStep('credentials');
      return;
    }
    setBusy(true);
    try {
      const [result] = await Promise.all([sessionRequest<{ mfaRequired?: boolean; mfaSetupRequired?: boolean }>('admin', 'login', { email: email.trim(), password, ...extra }), wait(MIN_WAIT_MS)]);
      // 2 passos (SEC-090/115): senha certa de admin com TOTP devolve só o desafio; o `mfaToken` fica em cookie HttpOnly.
      if (result.mfaRequired) {
        setStep('totp');
        setCode('');
        setRecovery('');
        setBusy(false);
        return;
      }
      enter(result);
    } catch (caught) {
      await wait(MIN_WAIT_MS);
      handleError(caught);
      setBusy(false);
    }
  }

  /** 2º passo: TOTP ou código de recuperação. O token do 1º passo já está no cookie; aqui só vai o código. */
  async function submitMfa(value: string) {
    setError(null);
    setBlocked(null);
    setBusy(true);
    try {
      const result = await sessionRequest<{ mfaSetupRequired?: boolean }>('admin', 'mfa', { code: value });
      enter(result);
    } catch (caught) {
      handleError(caught);
      setBusy(false);
    }
  }

  function enter(result: { mfaSetupRequired?: boolean }) {
    router.replace((result.mfaSetupRequired ? '/admin/verificacao' : (safeNext(params.get('next')) ?? '/admin')) as never);
  }

  function handleError(caught: unknown) {
    if (!(caught instanceof ApiError)) return setError('Não foi possível entrar. Tente de novo.');
    switch (caught.code) {
      case 'LOGIN_CODE_REQUIRED':
        setStep('email-code');
        setCode('');
        return;
      case 'MFA_INVALID':
      case 'INVALID_CREDENTIALS':
        setCode('');
        setRecovery('');
        return setError(step === 'totp' || step === 'email-code' ? 'Código incorreto ou vencido.' : step === 'recovery' ? 'Código incorreto ou já usado.' : 'E-mail ou senha incorretos.');
      case 'MFA_RATE_LIMITED':
        setCode('');
        setRecovery('');
        return setError(caught.retryAfterSeconds ? `Muitas tentativas. Tente de novo às ${clockAfterSeconds(caught.retryAfterSeconds)}.` : 'Muitas tentativas. Tente de novo em alguns minutos.');
      case 'RATE_LIMITED':
        return setBlocked({ title: 'Muitas tentativas', text: caught.retryAfterSeconds ? `Tente de novo às ${clockAfterSeconds(caught.retryAfterSeconds)} ou redefina a senha.` : 'Tente de novo em alguns minutos ou redefina a senha.' });
      case 'ACCOUNT_BLOCKED':
        return setBlocked({ title: 'Conta indisponível', text: 'Fale com o suporte para entender o motivo.' });
      case 'NETWORK':
        return setError('Sem conexão. Conecte-se para entrar.');
      default:
        return setError('Não foi possível entrar. Tente de novo.');
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (step === 'credentials') void submit();
    else if (step === 'recovery') void submitMfa(recovery.trim());
    else if (code.length === 6) void (step === 'email-code' ? submit({ code }) : submitMfa(code));
  }

  const banner =
    motivo === 'inatividade' ? 'Sua sessão terminou por inatividade.' : motivo === 'expirada' ? 'Entre de novo para continuar. Por segurança, sua sessão terminou.' : null;

  if (step === 'recovery') {
    return (
      <AuthCard title="Código de recuperação">
        <form onSubmit={onSubmit} className={ui.stack} noValidate>
          <p className="wb-text-body" style={{ margin: 0 }}>Digite um dos 10 códigos que você guardou. Cada um vale uma vez.</p>
          <TextField label="Código de recuperação" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="" autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="admin.recovery.input" hint="Formato XXXXX-XXXXX. Pode colar; o hífen e as letras maiúsculas são ignorados." />
          {error ? <Banner tone="danger" testId="admin.recovery.error">{error}</Banner> : null}
          <Button type="submit" size="lg" loading={busy} loadingLabel="Entrando…" data-testid="admin.recovery.submit">
            Entrar com o código
          </Button>
          <p className="wb-text-caption" style={{ margin: 0 }} data-testid="admin.recovery.help">Sem os códigos? Peça a um super admin para redefinir sua verificação.</p>
          <LinkButton onClick={() => { setStep('totp'); setError(null); }} testId="admin.login.back">Voltar</LinkButton>
        </form>
      </AuthCard>
    );
  }

  if (step === 'totp' || step === 'email-code') {
    const emailStep = step === 'email-code';
    return (
      <AuthCard title={emailStep ? 'Confirme por e-mail' : 'Verificação em duas etapas'}>
        <form onSubmit={onSubmit} className={ui.stack} noValidate>
          <p className="wb-text-body" style={{ margin: 0 }}>
            {emailStep ? 'Enviamos um código de 6 dígitos para o seu e-mail.' : 'Digite o código de 6 dígitos do seu app autenticador.'}
          </p>
          <OtpInput value={code} onChange={setCode} onComplete={(value) => void (emailStep ? submit({ code: value }) : submitMfa(value))} invalid={Boolean(error)} disabled={busy} autoFocus testId="admin.login.totp-input" />
          {error ? <Banner tone="danger" testId="admin.login.error">{error}</Banner> : null}
          {busy ? <p className="wb-text-caption" role="status" style={{ margin: 0 }}>Verificando…</p> : null}
          <div className={s.links}>
            {!emailStep ? <LinkButton onClick={() => { setStep('recovery'); setError(null); }} testId="admin.login.recovery-link">Usar um código de recuperação</LinkButton> : null}
            <LinkButton onClick={() => { setStep('credentials'); setError(null); setCode(''); }} testId="admin.login.back">Voltar</LinkButton>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Entrar no painel">
      <form onSubmit={onSubmit} className={ui.stack} noValidate>
        {banner ? <Banner tone="info" testId="admin.login.notice">{banner}</Banner> : null}
        {blocked ? (
          <Banner tone="warning" testId="admin.login.blocked">
            <strong>{blocked.title}.</strong> {blocked.text}
          </Banner>
        ) : null}
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} error={fieldErrors.email} data-testid={tid('login', 'email-input')} />
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" error={fieldErrors.password} testIds={{ input: tid('login', 'password-input'), toggle: tid('login', 'password-toggle') }} />
        {error ? <Banner tone="danger" testId="admin.login.error">{error}</Banner> : null}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Entrando…" data-testid={tid('login', 'submit')}>
          Entrar
        </Button>
        <Link href="/admin/esqueci-a-senha" className={s.link} data-testid={tid('login', 'forgot-password')}>
          Esqueci a senha
        </Link>
      </form>
    </AuthCard>
  );
}
