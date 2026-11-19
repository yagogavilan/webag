'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Banner, Button, OtpInput, PasswordField, TextField, ui } from '@/components/ui';
import { sessionRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { clockAfterSeconds } from '@/lib/format';
import { safeLojistaNext } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import { AuthCard, LinkButton } from './auth-card';
import s from './auth.module.css';

const MIN_WAIT_MS = 600;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * E7. Mensagem de login errado é uma só e o botão fica em "Entrando…" por no mínimo 600 ms nos dois casos, para o
 * tempo não denunciar se o e-mail existe (onda-1b §0.2). O botão nunca nasce desabilitado: o erro aparece ao tocar (DEC-024d).
 */
export function MerchantLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const motivo = params.get('motivo');
  const [stepUp, setStepUp] = useState(false);
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
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
      setStepUp(false);
      return;
    }
    setBusy(true);
    try {
      await Promise.all([sessionRequest('lojista', 'login', { email: email.trim(), password, ...extra }), wait(MIN_WAIT_MS)]);
      router.replace((safeLojistaNext(params.get('next')) ?? '/lojista') as never);
    } catch (caught) {
      await wait(MIN_WAIT_MS);
      handleError(caught);
      setBusy(false);
    }
  }

  function handleError(caught: unknown) {
    if (!(caught instanceof ApiError)) return setError('Não foi possível entrar. Tente de novo.');
    switch (caught.code) {
      case 'LOGIN_CODE_REQUIRED':
        setStepUp(true);
        setCode('');
        return;
      case 'INVALID_CREDENTIALS':
        setCode('');
        return setError(stepUp ? 'Código incorreto ou vencido.' : 'E-mail ou senha incorretos.');
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
    if (!stepUp) void submit();
    else if (code.length === 6) void submit({ code });
  }

  if (stepUp) {
    return (
      <AuthCard area="lojista" title="Confirme que é você">
        <form onSubmit={onSubmit} className={ui.stack} noValidate>
          <p className="wb-text-body" style={{ margin: 0 }}>Vimos várias tentativas de entrar na sua conta. Enviamos um código de 6 dígitos para o seu e-mail.</p>
          <OtpInput value={code} onChange={setCode} onComplete={(value) => void submit({ code: value })} invalid={Boolean(error)} disabled={busy} autoFocus testId={ltid('login', 'totp-input')} />
          {error ? <Banner tone="danger" testId={ltid('login', 'error')}>{error}</Banner> : null}
          {busy ? <p className="wb-text-caption" role="status" style={{ margin: 0 }}>Verificando…</p> : null}
          <LinkButton onClick={() => { setStepUp(false); setError(null); setCode(''); }} testId={ltid('login', 'back')}>Voltar</LinkButton>
        </form>
      </AuthCard>
    );
  }

  const notice = motivo === 'expirada' ? 'Entre de novo para continuar. Por segurança, sua sessão terminou.' : null;
  const signup = `/lojista/cadastro${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`;

  return (
    <AuthCard area="lojista" title="Entrar no painel da loja">
      <form onSubmit={onSubmit} className={ui.stack} noValidate>
        {notice ? <Banner tone="info" testId={ltid('login', 'notice')}>{notice}</Banner> : null}
        {blocked ? (
          <Banner tone="warning" testId={ltid('login', 'wait-banner')}>
            <strong>{blocked.title}.</strong> {blocked.text}
          </Banner>
        ) : null}
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} error={fieldErrors.email} data-testid={ltid('login', 'email-input')} />
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" error={fieldErrors.password} testIds={{ input: ltid('login', 'password-input'), toggle: ltid('login', 'password-toggle') }} />
        {error ? <Banner tone="danger" testId={ltid('login', 'error')}>{error}</Banner> : null}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Entrando…" data-testid={ltid('login', 'submit')}>
          Entrar
        </Button>
        <div className={s.links}>
          <Link href="/lojista/esqueci-a-senha" className={s.link} data-testid={ltid('login', 'forgot-password')}>
            Esqueci a senha
          </Link>
          <Link href="/lojista/desistir-da-exclusao" className={s.link} data-testid={ltid('login', 'cancel-deletion')}>
            Desistir da exclusão da conta
          </Link>
          <Link href={signup as never} className={s.link} data-testid={ltid('login', 'signup-link')}>
            Quero cadastrar minha loja
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
