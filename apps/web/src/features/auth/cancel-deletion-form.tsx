'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Banner, Button, OtpInput, PasswordField, TextField, ui } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { ltid } from '@/lib/testid';
import { AuthCard } from './auth-card';
import s from './auth.module.css';

/**
 * Arrependimento da exclusão da conta (SEC-096): e-mail e senha, dentro do prazo. Qualquer falha responde igual (a API não revela se a
 * conta existe nem se está em exclusão), então a mensagem também é uma só.
 *
 * SEC-176: com a conta sob ataque (step-up), a senha certa recebe 403 `LOGIN_CODE_REQUIRED` e a API já enviou o código ao e-mail. A tela
 * mostra "Enviamos um código ao seu e-mail" e o campo de 6 dígitos e reenvia e-mail, senha e `code`. Reenviar = repetir sem `code`.
 */
export function CancelDeletionForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (needsCode && code.length !== 6) return setError('Digite os 6 dígitos do código.');
    void send(needsCode ? code : '');
  }

  /** `wanted` vazio = primeiro passo (ou reenvio do código); com 6 dígitos = passo 3. */
  async function send(wanted: string) {
    if (busy) return;
    const found = { email: email.trim() ? undefined : 'Digite seu e-mail.', password: password ? undefined : 'Digite sua senha.' };
    setErrors(found);
    setError(null);
    if (found.email || found.password) return;
    setBusy(true);
    try {
      await apiRequest('lojista', 'auth/account-deletion/cancel', { method: 'POST', body: { email: email.trim(), password, ...(wanted ? { code: wanted } : {}) } });
      setDone(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'LOGIN_CODE_REQUIRED') {
        setNeedsCode(true);
        setCode('');
      } else if (caught instanceof ApiError && (caught.code === 'CODE_INVALID' || caught.code === 'CODE_EXPIRED')) {
        setCode('');
        setError(caught.code === 'CODE_EXPIRED' ? 'O código venceu. Toque em "Reenviar código".' : 'Código incorreto. Confira o código ou peça um novo.');
      } else if (caught instanceof ApiError && caught.isNetwork) setError('Sem conexão. Tente de novo quando a internet voltar.');
      else if (caught instanceof ApiError && caught.status === 429) setError('Muitas tentativas. Espere um pouco e tente de novo.');
      else setError('Não foi possível reativar. Confira o e-mail e a senha. Se o prazo para desistir já passou, a exclusão não pode ser desfeita.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard area="lojista" title="Conta reativada">
        <p className="wb-text-body" style={{ margin: 0 }} data-testid={ltid('desistir', 'done')}>A exclusão foi cancelada. Entre normalmente com o seu e-mail e a sua senha.</p>
        <Link href="/lojista/entrar" className={s.link}>Ir para a tela de entrada</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard area="lojista" title="Desistir da exclusão">
      <form onSubmit={submit} className={ui.stack} noValidate>
        <p className="wb-text-body" style={{ margin: 0 }}>Se você pediu para excluir a conta e ainda está no prazo, informe o e-mail e a senha para reativá-la.</p>
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} error={errors.email} disabled={needsCode} data-testid={ltid('desistir', 'email')} />
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} testIds={{ input: ltid('desistir', 'password') }} />
        {needsCode ? (
          <div className={ui.stack} data-testid={ltid('desistir', 'code-step')}>
            <Banner tone="info">Enviamos um código de 6 dígitos ao seu e-mail. Digite-o para reativar a conta. Ele vale 10 minutos.</Banner>
            <OtpInput value={code} onChange={setCode} onComplete={(value) => void send(value)} invalid={Boolean(error)} disabled={busy} testId={ltid('desistir', 'otp')} autoFocus />
            <Button variant="text" onClick={() => void send('')} disabled={busy} data-testid={ltid('desistir', 'resend')}>Reenviar código</Button>
          </div>
        ) : null}
        {error ? <Banner tone="danger" testId={ltid('desistir', 'error')}>{error}</Banner> : null}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Reativando…" data-testid={ltid('desistir', 'submit')}>Reativar minha conta</Button>
        <Link href="/lojista/entrar" className={s.link}>Voltar</Link>
      </form>
    </AuthCard>
  );
}
