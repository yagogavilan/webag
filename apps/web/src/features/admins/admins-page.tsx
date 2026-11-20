'use client';

import { CheckCircle, MinusCircle, ShieldCheck, UserPlus, Warning } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useReauth } from '@/components/panel/reauth';
import { useSession } from '@/components/panel/session-context';
import { ActionMenu, Badge, Banner, Button, Dialog, NoAccessState, QueryBoundary, RadioCards, SelectField, TabPanel, Tabs, TextField, cx, ui, useToast } from '@/components/ui';
import s from '@/components/panel/panel.module.css';
import { PROFILE_DESCRIPTION, PROFILE_LABEL } from '@/lib/admin-access';
import { adminApi, keys, type AdminUser, type VerifiedChannel } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import type { AdminProfile } from '@/lib/session-types';
import { tid } from '@/lib/testid';
import { ACCESS_TEXT, MATRIX, PROFILES, isLastSuper, type Access } from './profiles';

const T = (id: string) => tid('admins', id);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CHANNELS: { value: VerifiedChannel; label: string }[] = [
  { value: 'video_call', label: 'Videochamada' },
  { value: 'in_person', label: 'Pessoalmente' },
  { value: 'registered_phone', label: 'Telefone cadastrado' },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

function ProfileRadios({ value, onChange, name }: { value: AdminProfile | null; onChange: (p: AdminProfile) => void; name: string }) {
  return <RadioCards legend="Perfil" name={name} value={value} onChange={onChange} options={PROFILES.map((p) => ({ value: p, label: PROFILE_LABEL[p], description: PROFILE_DESCRIPTION[p], testId: T(`invite-profile-${p}`) }))} />;
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const reauth = useReauth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; profile?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const next = {
      name: name.trim().length < 2 ? 'Digite o nome.' : undefined,
      email: EMAIL.test(email.trim()) ? undefined : 'Confira o e-mail.',
      profile: profile ? undefined : 'Escolha um perfil.',
    };
    setErrors(next);
    setError(null);
    if (next.name || next.email || !profile) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), email: email.trim().toLowerCase(), profile };
      await reauth.guard(() => adminApi.inviteAdmin(body), 'Convidar um admin muda quem acessa o painel. Confirme com o código do app autenticador.');
      await client.invalidateQueries({ queryKey: keys.admins });
      toast.show(`Convite enviado para ${body.email}.`);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'EMAIL_ALREADY_REGISTERED') setErrors({ email: 'Esse e-mail já tem conta. Use um e-mail exclusivo do Webag.' });
      else if (caught instanceof ApiError && caught.code === 'REAUTH_CANCELLED') setError(null);
      else setError(saveErrorMessage(caught, 'Não foi possível enviar o convite. O que você digitou continua aqui.'));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Convidar admin"
      onClose={onClose}
      locked={busy}
      testId={T('invite-dialog')}
      actions={
        <>
          <Button onClick={() => void submit()} loading={busy} loadingLabel="Enviando…" data-testid={T('invite-submit')}>Enviar convite</Button>
          <Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button>
        </>
      }
    >
      <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="off" data-testid={T('invite-name-input')} />
      <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="off" data-testid={T('invite-email-input')} />
      <ProfileRadios value={profile} onChange={setProfile} name="invite-profile" />
      {errors.profile ? <p role="alert" className="wb-text-caption-strong" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>{errors.profile}</p> : null}
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>O convite vale 48 horas e só serve para este e-mail.</p>
      {error ? <Banner tone="danger" testId={T('invite-error')}>{error}</Banner> : null}
    </Dialog>
  );
}

function ChangeProfileDialog({ admin, onClose }: { admin: AdminUser; onClose: () => void }) {
  const client = useQueryClient();
  const reauth = useReauth();
  const toast = useToast();
  const [profile, setProfile] = useState<AdminProfile>(admin.profile);
  return (
    <ReasonDialog
      title={`Alterar o perfil de ${admin.name}?`}
      description={`Vale na hora. As sessões de ${admin.name} são encerradas.`}
      withReason={false}
      confirmLabel="Alterar perfil"
      extra={<ProfileRadios value={profile} onChange={setProfile} name="change-profile" />}
      precheck={() => (profile === admin.profile ? 'Escolha um perfil diferente do atual.' : null)}
      onConfirm={async () => {
        await reauth.guard(() => adminApi.updateAdmin(admin.userId, { profile }), 'Mudar o perfil de um admin exige o código do app autenticador.');
        await client.invalidateQueries({ queryKey: keys.admins });
        toast.show(`Perfil alterado. As sessões de ${admin.name} foram encerradas.`);
      }}
      onClose={onClose}
    />
  );
}

function ResetTotpDialog({ admin, onClose }: { admin: AdminUser; onClose: () => void }) {
  const client = useQueryClient();
  const reauth = useReauth();
  const toast = useToast();
  const [channel, setChannel] = useState<VerifiedChannel | ''>('');
  return (
    <ReasonDialog
      title={`Redefinir a verificação de ${admin.name}?`}
      description={`${admin.name} precisa configurar a verificação em duas etapas de novo no próximo login. Confirme a identidade fora do sistema antes.`}
      minReason={20}
      maxReason={500}
      confirmLabel="Redefinir verificação"
      destructive
      extra={
        <SelectField label="Como a identidade foi conferida" value={channel} onChange={(e) => setChannel(e.target.value as VerifiedChannel)} data-testid={T('reset-channel')}>
          <option value="">Escolha</option>
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </SelectField>
      }
      precheck={() => (channel ? null : 'Informe como a identidade foi conferida.')}
      onConfirm={async (reason) => {
        await reauth.guard(() => adminApi.resetTotp(admin.userId, { reason, verifiedChannel: channel as VerifiedChannel }), 'Redefinir o acesso de outro admin exige o código do app autenticador.');
        await client.invalidateQueries({ queryKey: keys.admins });
        toast.show(`Verificação de ${admin.name} redefinida.`);
      }}
      onClose={onClose}
      testIds={{ reason: T('reset-reason-input'), confirm: T('reset-confirm') }}
    />
  );
}

function ActiveDialog({ admin, onClose }: { admin: AdminUser; onClose: () => void }) {
  const client = useQueryClient();
  const reauth = useReauth();
  const toast = useToast();
  const off = admin.active;
  return (
    <ReasonDialog
      title={off ? `Desativar ${admin.name}?` : `Reativar ${admin.name}?`}
      description={off ? `${admin.name} perde o acesso agora e as sessões são encerradas.` : `${admin.name} volta a entrar no painel com o perfil ${PROFILE_LABEL[admin.profile]}.`}
      withReason={false}
      confirmLabel={off ? 'Desativar' : 'Reativar'}
      destructive={off}
      onConfirm={async () => {
        await reauth.guard(() => adminApi.updateAdmin(admin.userId, { active: !off }), 'Mudar o acesso de um admin exige o código do app autenticador.');
        await client.invalidateQueries({ queryKey: keys.admins });
        toast.show(off ? `${admin.name} foi desativada.` : `${admin.name} foi reativada.`);
      }}
      onClose={onClose}
      testIds={{ confirm: T('active-confirm') }}
    />
  );
}

type Action = { kind: 'profile' | 'reset' | 'active'; admin: AdminUser } | { kind: 'invite' } | { kind: 'last'; admin: AdminUser } | null;

function AccessCell({ value }: { value: Access }) {
  const Icon = value === 'can' ? CheckCircle : value === 'view' ? ShieldCheck : MinusCircle;
  return (
    <span className={ui.row} style={{ gap: 4 }}>
      <Icon size={20} aria-hidden="true" /> {ACCESS_TEXT[value]}
    </span>
  );
}

export function AdminsPage() {
  const { canView, user } = useSession();
  const query = useQuery({ queryKey: keys.admins, queryFn: adminApi.admins });
  const [tab, setTab] = useState<'admins' | 'profiles'>('admins');
  const [action, setAction] = useState<Action>(null);
  if (!canView('admins')) return <NoAccessState />;

  return (
    <>
      <PageHeader title="Admins e perfis" description="Dê o acesso certo e tire na hora. Toda ação aqui pede o código do app autenticador." action={<Button icon={<UserPlus size={20} aria-hidden="true" />} onClick={() => setAction({ kind: 'invite' })} data-testid={T('invite-open')}>Convidar admin</Button>} />
      <Tabs label="Admins e perfis" value={tab} onChange={setTab} tabs={[{ id: 'admins', label: 'Admins', testId: T('tab-admins') }, { id: 'profiles', label: 'O que cada perfil vê', testId: T('tab-profiles') }]} />
      <TabPanel id={tab}>
        {tab === 'profiles' ? (
          <div className={s.matrixWrap}>
            <table className={s.matrix} data-testid={T('profile-matrix')}>
              <caption className="wb-text-caption">O que cada perfil pode fazer. Fonte: matriz de permissões do PRD do admin.</caption>
              <thead>
                <tr>
                  <th scope="col">Ação</th>
                  {PROFILES.map((p) => (
                    <th key={p} scope="col">{PROFILE_LABEL[p]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.action}>
                    <th scope="row" className="wb-text-body">{row.action}</th>
                    {PROFILES.map((p) => (
                      <td key={p}><AccessCell value={row.access[p]} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <QueryBoundary query={query} skeletonLabel="Carregando admins" skeleton={<div data-testid="skeleton" role="status" aria-label="Carregando admins" className={ui.skeletonList}>{Array.from({ length: 4 }, (_, i) => <span key={i} className={ui.skeleton} style={{ height: 72 }} aria-hidden="true" />)}</div>}>
            {(page) => (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <caption>Admins do Webag</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nome e e-mail</th>
                      <th scope="col">Perfil</th>
                      <th scope="col">Verificação em duas etapas</th>
                      <th scope="col">Status</th>
                      <th scope="col"><span className={ui.srOnly}>Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.data.map((admin) => {
                      const me = admin.userId === user.id;
                      const last = isLastSuper(page.data, admin.userId);
                      const guardLast = (kind: 'profile' | 'active') => () => setAction(last ? { kind: 'last', admin } : { kind, admin });
                      const menu = me
                        ? []
                        : [
                            { label: 'Alterar perfil', onSelect: guardLast('profile'), testId: T(`admin-${admin.userId}-change-profile`) },
                            ...(admin.totpConfigured ? [{ label: 'Redefinir verificação em duas etapas', onSelect: () => setAction({ kind: 'reset', admin }), testId: T(`admin-${admin.userId}-reset-totp`) }] : []),
                            admin.active
                              ? { label: 'Desativar', onSelect: guardLast('active'), danger: true, testId: T(`admin-${admin.userId}-deactivate`) }
                              : { label: 'Reativar', onSelect: () => setAction({ kind: 'active', admin }), testId: T(`admin-${admin.userId}-reactivate`) },
                          ];
                      return (
                        <tr key={admin.userId} data-testid={T(`admin-${admin.userId}`)}>
                          <td data-primary>
                            <span className={ui.row}>
                              <span className={s.avatar} aria-hidden="true">{initials(admin.name)}</span>
                              <span>
                                <span className="wb-text-body-strong">{admin.name}{me ? ' (Você)' : ''}</span>
                                <span className={cx('wb-text-caption', ui.muted)} style={{ display: 'block' }}>{admin.email}</span>
                              </span>
                            </span>
                          </td>
                          <td data-label="Perfil"><Badge tone="brand">{PROFILE_LABEL[admin.profile]}</Badge></td>
                          <td data-label="Verificação">{admin.totpConfigured ? <Badge tone="success" icon={<CheckCircle size={16} aria-hidden="true" />}>Configurada</Badge> : <Badge tone="warning" icon={<Warning size={16} aria-hidden="true" />}>Pendente</Badge>}</td>
                          <td data-label="Status"><Badge tone={admin.active ? 'success' : 'neutral'}>{admin.active ? 'Ativo' : 'Desativado'}</Badge></td>
                          <td>{menu.length ? <ActionMenu label={`Ações de ${admin.name}`} actions={menu} testId={T(`admin-${admin.userId}-menu`)} /> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </QueryBoundary>
        )}
      </TabPanel>
      {action?.kind === 'invite' ? <InviteDialog onClose={() => setAction(null)} /> : null}
      {action?.kind === 'profile' ? <ChangeProfileDialog admin={action.admin} onClose={() => setAction(null)} /> : null}
      {action?.kind === 'reset' ? <ResetTotpDialog admin={action.admin} onClose={() => setAction(null)} /> : null}
      {action?.kind === 'active' ? <ActiveDialog admin={action.admin} onClose={() => setAction(null)} /> : null}
      {action?.kind === 'last' ? (
        <Dialog title="Precisa existir ao menos 1 super admin." onClose={() => setAction(null)} testId={T('last-super-dialog')} actions={<Button onClick={() => setAction(null)}>Entendi</Button>}>
          <p className="wb-text-body" style={{ margin: 0 }}>Dê o perfil de super admin a outra pessoa antes.</p>
        </Dialog>
      ) : null}
    </>
  );
}
