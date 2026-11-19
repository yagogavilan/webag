'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Banner, Button, OtpInput, PasswordField, TextField, ui } from '@/components/ui';
import { failureMessage, postStep } from './deletion-client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const T = (id: string) => `public.excluir.cancel-${id}`;

/**
 * Arrependimento da exclusão (WB-213/214, SEC-096, SEC-176) na página pública, para quem não tem mais o app. E-mail e senha; se a
 * API responder 403 `LOGIN_CODE_REQUIRED` (conta sob ataque), ela já enviou o código ao e-mail e a tela abre o campo de 6 dígitos,
 * reenviando e-mail, senha e `code`. Qualquer outra falha usa uma única mensagem (a API não revela se a conta existe nem se está em
 * exclusão). Reenviar o código = repetir o primeiro passo sem `code`.
 */
export function CancelDeletionPublic() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const lock = useRef(false);

  async function send(withCode: string | null) {
    if (lock.current) return;
    const found = {
      email: EMAIL.test(email.trim()) ? undefined : 'Digite o e-mail da conta, como nome@exemplo.com.',
      password: password ? undefined : 'Digite a sua senha.',
    };
    setErrors(found);
    setError(null);
    if (found.email || found.password) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await postStep('cancel', { email: email.trim(), password, ...(withCode ? { code: withCode } : {}) });
      if (result.ok) {
        setPassword('');
        setDone(true);
        return;
      }
      if (result.code === 'LOGIN_CODE_REQUIRED') {
        setNeedsCode(true);
        setCode('');
        return;
      }
      if (result.code === 'CODE_INVALID' || result.code === 'CODE_EXPIRED') setCode('');
      if (result.code === 'INVALID_CREDENTIALS') {
        setError('Não foi possível reativar. Confira o e-mail e a senha. Se o prazo para desistir já passou, a exclusão não pode ser desfeita.');
        return;
      }
      setError(failureMessage(result));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (needsCode && code.length !== 6) return setError('Digite os 6 dígitos do código.');
    void send(needsCode ? code : null);
  }

  if (done) {
    return (
      <Banner tone="success" testId={T('done')}>
        <strong>A exclusão foi cancelada.</strong> A sua conta voltou a funcionar. Entre normalmente no app com o seu e-mail e a sua senha.
      </Banner>
    );
  }
  return (
    <form onSubmit={submit} className={ui.stack} noValidate data-testid={T('form')}>
      <TextField label="E-mail da conta" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} disabled={needsCode} data-testid={T('email')} />
      <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} testIds={{ input: T('password') }} />
      {needsCode ? (
        <div className={ui.stack} data-testid={T('code-step')}>
          <Banner tone="info">Por segurança, enviamos um código de 6 dígitos para o e-mail da conta. Digite-o para reativar. Ele vale 10 minutos.</Banner>
          <OtpInput value={code} onChange={setCode} onComplete={(value) => void send(value)} invalid={Boolean(error)} disabled={busy} testId={T('otp')} autoFocus />
          <Button variant="text" onClick={() => void send(null)} disabled={busy} data-testid={T('resend')}>Reenviar código</Button>
        </div>
      ) : null}
      {error ? <Banner tone="danger" offline={error.startsWith('Sem conexão')} testId={T('error')}>{error}</Banner> : null}
      <Button type="submit" size="lg" loading={busy} loadingLabel="Reativando…" data-testid={T('submit')}>{needsCode ? 'Reativar com o código' : 'Reativar minha conta'}</Button>
    </form>
  );
}
