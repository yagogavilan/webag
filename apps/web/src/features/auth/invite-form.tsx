'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Clock } from '@phosphor-icons/react';
import { Banner, Button, MessageState, NewPasswordPair, ui } from '@/components/ui';
import { sessionRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { tid } from '@/lib/testid';
import { AuthCard } from './auth-card';

/** AC4: o convite só traz o token na URL; o servidor valida ao enviar (410 = vencido, usado ou revogado). */
export function InviteForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [invalid, setInvalid] = useState(token.length < 20);

  if (invalid) {
    return (
      <AuthCard title="Convite inválido">
        <MessageState icon={Clock} title="Convite inválido" text="Esse convite não vale mais. Peça um novo a um super admin." testId={tid('invite', 'invalid')} />
      </AuthCard>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (password.length < 8) next.password = 'Senha fraca. Use 8 caracteres ou mais, com letras e números.';
    if (confirm !== password) next.confirm = 'As senhas não são iguais.';
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    try {
      await sessionRequest('admin', 'accept-invite', { token, password });
      router.replace('/admin/verificacao');
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.status === 410) return setInvalid(true);
      if (caught instanceof ApiError && caught.status === 422) {
        return setErrors({ password: caught.fieldMessage('password') ?? caught.detail ?? 'Essa senha é muito comum. Escolha outra.' });
      }
      setErrors({ form: caught instanceof ApiError && caught.isNetwork ? 'Sem conexão. Conecte-se para continuar.' : 'Não foi possível criar a senha. O que você digitou continua aqui.' });
    }
  }

  return (
    <AuthCard title="Você foi convidado para o Webag Admin">
      <form onSubmit={onSubmit} className={ui.stack} noValidate>
        <p className="wb-text-body" style={{ margin: 0 }}>Crie sua senha. Em seguida, você liga a verificação em duas etapas.</p>
        <NewPasswordPair password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} passwordError={errors.password} confirmError={errors.confirm} testIds={{ password: tid('invite', 'password-input'), confirm: tid('invite', 'password-confirm-input'), toggle: tid('invite', 'password-toggle') }} />
        {errors.form ? <Banner tone="danger">{errors.form}</Banner> : null}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Criando…" data-testid={tid('invite', 'submit')}>
          Criar senha e continuar
        </Button>
      </form>
    </AuthCard>
  );
}
