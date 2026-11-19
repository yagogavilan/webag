'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Banner, Button, PasswordField, TextField, ui } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { ltid } from '@/lib/testid';
import { AuthCard } from './auth-card';
import s from './auth.module.css';

/**
 * Arrependimento da exclusão da conta (SEC-096): e-mail e senha, dentro do prazo. Qualquer falha responde igual (a API não revela se a
 * conta existe nem se está em exclusão), então a mensagem também é uma só.
 */
export function CancelDeletionForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = { email: email.trim() ? undefined : 'Digite seu e-mail.', password: password ? undefined : 'Digite sua senha.' };
    setErrors(found);
    setError(null);
    if (found.email || found.password) return;
    setBusy(true);
    try {
      await apiRequest('lojista', 'auth/account-deletion/cancel', { method: 'POST', body: { email: email.trim(), password } });
      setDone(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.isNetwork) setError('Sem conexão. Tente de novo quando a internet voltar.');
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
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} error={errors.email} data-testid={ltid('desistir', 'email')} />
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} testIds={{ input: ltid('desistir', 'password') }} />
        {error ? <Banner tone="danger" testId={ltid('desistir', 'error')}>{error}</Banner> : null}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Reativando…" data-testid={ltid('desistir', 'submit')}>Reativar minha conta</Button>
        <Link href="/lojista/entrar" className={s.link}>Voltar</Link>
      </form>
    </AuthCard>
  );
}
