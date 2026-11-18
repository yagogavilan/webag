'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { RecoveryCodes } from '@/components/panel/recovery-codes';
import { useReauth } from '@/components/panel/reauth';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, Dialog, NewPasswordPair, PasswordField, QueryBoundary, cx, ui, useToast } from '@/components/ui';
import { PROFILE_LABEL } from '@/lib/admin-access';
import { adminApi, keys } from '@/lib/api/admin';
import { sessionRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';

const T = (id: string) => tid('profile', id);

function PasswordSection() {
  const reauth = useReauth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const found = {
      current: current ? undefined : 'Digite a senha atual.',
      next: next.length < 8 ? 'Use ao menos 8 caracteres.' : next === current ? 'A nova senha precisa ser diferente da atual.' : undefined,
      confirm: confirm !== next ? 'As senhas não são iguais.' : undefined,
    };
    setErrors(found);
    setError(null);
    if (found.current || found.next || found.confirm) return;
    setBusy(true);
    try {
      await reauth.guard(() => adminApi.changePassword({ currentPassword: current, newPassword: next }), 'Para alterar a senha, confirme com o código do app autenticador.');
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.show('Senha alterada.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'REAUTH_CANCELLED') return;
      if (caught instanceof ApiError && (caught.status === 400 || caught.status === 401 || caught.status === 422)) setErrors({ current: 'Senha atual incorreta ou nova senha fraca demais. Confira e tente de novo.' });
      else setError(saveErrorMessage(caught, 'Não foi possível alterar a senha. O que você digitou continua aqui.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={ui.card} aria-labelledby="profile-password">
      <form className={ui.stack} noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2 id="profile-password" className="wb-text-title2" style={{ margin: 0 }}>Senha</h2>
        <PasswordField label="Senha atual" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" testIds={{ input: T('password-current-input') }} />
        <NewPasswordPair password={next} confirm={confirm} onPassword={setNext} onConfirm={setConfirm} passwordLabel="Nova senha" passwordError={errors.next} confirmError={errors.confirm} testIds={{ password: T('password-input'), confirm: T('password-confirm-input') }} />
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Ao trocar a senha, os outros aparelhos saem da conta.</p>
        {error ? <Banner tone="danger" testId={T('password-error')}>{error}</Banner> : null}
        <Button type="submit" loading={busy} loadingLabel="Salvando…" data-testid={T('password-submit')}>Alterar senha</Button>
      </form>
    </section>
  );
}

function RecoverySection() {
  const reauth = useReauth();
  const toast = useToast();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const result = await reauth.guard(() => adminApi.regenerateRecoveryCodes(), 'Gerar novos códigos exige o código do app autenticador.');
      setCodes(result.recoveryCodes);
      setAsking(false);
      toast.show('Novos códigos gerados. Os antigos não valem mais.');
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.code === 'REAUTH_CANCELLED')) setError(saveErrorMessage(caught, 'Não foi possível gerar os códigos. Os antigos continuam valendo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={ui.card} aria-labelledby="profile-2fa">
      <div className={ui.stack}>
        <h2 id="profile-2fa" className="wb-text-title2" style={{ margin: 0 }}>Verificação em duas etapas</h2>
        <p className="wb-text-body" style={{ margin: 0 }}>Ligada. Todo login no painel pede o código do app autenticador.</p>
        {codes ? (
          <>
            <RecoveryCodes codes={codes} screen="profile" />
            <Button variant="secondary" onClick={() => setCodes(null)} data-testid={T('recovery-done')}>Já guardei os códigos</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setAsking(true)} data-testid={T('recovery-regenerate')}>Gerar novos códigos de recuperação</Button>
        )}
      </div>
      {asking ? (
        <Dialog
          title="Gerar novos códigos?"
          onClose={() => setAsking(false)}
          locked={busy}
          testId={T('recovery-dialog')}
          actions={
            <>
              <Button onClick={() => void regenerate()} loading={busy} loadingLabel="Gerando…" data-testid={T('recovery-confirm')}>Gerar novos códigos</Button>
              <Button variant="text" onClick={() => setAsking(false)} disabled={busy}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Os códigos de hoje deixam de valer. Os novos aparecem só uma vez.</p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </Dialog>
      ) : null}
    </section>
  );
}

function DevicesSection() {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({ queryKey: keys.sessions, queryFn: adminApi.sessions });
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logoutAll() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.logoutAll();
      await client.cancelQueries();
      toast.show('Você saiu de todos os aparelhos.');
      await sessionRequest('admin', 'logout').catch(() => undefined);
      router.replace('/admin/entrar' as never);
    } catch (caught) {
      setError(saveErrorMessage(caught, 'Não foi possível sair dos aparelhos. Tente de novo.'));
      setBusy(false);
    }
  }

  return (
    <section className={ui.card} aria-labelledby="profile-devices">
      <div className={ui.stack}>
        <h2 id="profile-devices" className="wb-text-title2" style={{ margin: 0 }}>Aparelhos</h2>
        <QueryBoundary query={sessions} skeletonLabel="Carregando aparelhos" skeleton={<span className={ui.skeleton} style={{ height: 48 }} role="status" aria-label="Carregando aparelhos" />}>
          {(page) => (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid={T('sessions')}>
              {page.data.map((row) => (
                <li key={row.id} className="wb-text-body" style={{ padding: '8px 0' }}>
                  {row.userAgent ?? 'Aparelho desconhecido'}{row.current ? ' (este)' : ''}
                  <span className={cx('wb-text-caption', ui.muted)} style={{ display: 'block' }}>Último uso {formatDateTime(row.lastUsedAt)}{row.ip ? ` · ${row.ip}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
        <Button variant="secondary" onClick={() => setAsking(true)} data-testid={T('logout-all')}>Sair de todos os aparelhos</Button>
      </div>
      {asking ? (
        <Dialog
          title="Sair de todos os aparelhos?"
          onClose={() => setAsking(false)}
          locked={busy}
          actions={
            <>
              <Button variant="destructive" onClick={() => void logoutAll()} loading={busy} loadingLabel="Saindo…" data-testid={T('logout-all-confirm')}>Sair de todos</Button>
              <Button variant="text" onClick={() => setAsking(false)} disabled={busy}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Este aparelho também sai. Você precisará entrar de novo.</p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </Dialog>
      ) : null}
    </section>
  );
}

export function ProfilePage() {
  const { user, canView } = useSession();
  return (
    <>
      <PageHeader title="Meu perfil e segurança" description="Cuide do seu próprio acesso." />
      <div className={ui.stack} style={{ maxWidth: 640 }}>
        <section className={ui.card} aria-labelledby="profile-me" data-testid={T('me')}>
          <div className={ui.stack}>
            <h2 id="profile-me" className="wb-text-title2" style={{ margin: 0 }}>Eu</h2>
            <p className="wb-text-body-strong" style={{ margin: 0 }}>{user.name}</p>
            <p className="wb-text-body" style={{ margin: 0 }}>{user.email}</p>
            <div>{user.adminProfile ? <Badge tone="brand">{PROFILE_LABEL[user.adminProfile]}</Badge> : null}</div>
          </div>
        </section>
        <PasswordSection />
        <RecoverySection />
        <DevicesSection />
        {canView('auditoria') ? (
          <Link href={asRoute(`/admin/auditoria?actorId=${encodeURIComponent(user.id)}`)} className="wb-text-body-strong" data-testid={T('activity-link')}>Ver minha atividade</Link>
        ) : null}
      </div>
    </>
  );
}
