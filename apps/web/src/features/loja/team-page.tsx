'use client';

import { UsersThree } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useReauth } from '@/components/panel/reauth';
import { ActionMenu, Badge, Banner, Button, CheckboxField, Dialog, EmptyState, QueryBoundary, SkeletonRows, TextField, cx, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { merchantApi, STAFF_PERMISSIONS, type TeamMember } from '@/lib/api/lojista';
import { isEmailLike } from '@/lib/team';
import { formatDay } from '@/lib/format';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { LojistaNoAccess } from './settings-screen';
import { useMerchant } from '../lojista/store-context';
import { isOwner } from '@/lib/lojista-access';
import s from '../lojista/lojista.module.css';

const T = (id: string) => ltid('equipe', id);
const PERM_LABEL = Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.id, p.label]));
const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

function inviteError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.code === 'INVITATION_EXISTS' || caught.status === 409) return caught.code === 'USER_IN_OTHER_STORE' ? 'Esse e-mail já participa de outra loja.' : 'Já existe um convite para esse e-mail.';
    if (caught.code === 'REAUTH_CANCELLED') return '';
  }
  return saveErrorMessage(caught);
}

/** L9: equipe da loja. Só o dono; convidar, mudar permissões, cancelar convite e remover pedem a senha de novo (WB-075). */
export function TeamPage() {
  const { store: storeQuery } = useMerchant();
  const store = storeQuery.data ?? null;
  const owner = isOwner(store);
  const client = useQueryClient();
  const toast = useToast();
  const reauth = useReauth();
  const online = useOnline();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const team = useQuery({ queryKey: ['lojista', 'team', store?.id], queryFn: () => merchantApi.team(store!.id), enabled: Boolean(store) && owner });
  if (store && !owner) return <LojistaNoAccess />;

  const refresh = () => client.invalidateQueries({ queryKey: ['lojista', 'team'] });
  const guard = <R,>(action: () => Promise<R>, reason: string) => reauth.guard(action, reason);

  return (
    <div className={ui.stack}>
      <div className={ui.pageHeader}>
        <h1 className="wb-text-title1" tabIndex={-1} style={{ margin: 0 }}>Equipe</h1>
        <Button onClick={() => setInviting(true)} disabled={!online} data-testid={T('invite-open')}>Convidar funcionário</Button>
      </div>
      {!online ? <Banner tone="warning" offline>Conecte-se para alterar a equipe.</Banner> : null}
      <QueryBoundary
        query={team}
        skeleton={<SkeletonRows rows={3} height={72} label="Carregando a equipe" />}
        empty={(members) => (members.filter((m) => m.role !== 'owner').length === 0 ? <EmptyState icon={UsersThree} title="Você trabalha sozinho por enquanto" text="Convide quem atende os pedidos com você." actionLabel="Convidar funcionário" onAction={() => setInviting(true)} testId={T('empty')} /> : null)}
      >
        {(members) => (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid={T('list')}>
            {[...members].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0)).map((member) => (
              <li key={member.id} className={s.member} data-testid={T(`member-${member.id}`)}>
                <span className={s.memberMain} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <span aria-hidden="true" className="wb-text-body-strong" style={{ width: 40, height: 40, borderRadius: 20, display: 'inline-grid', placeItems: 'center', background: 'var(--wb-color-surface-sunken)' }}>{initials(member.name)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="wb-text-body-strong" style={{ display: 'block' }}>{member.name}</span>
                    <span className={cx('wb-text-caption', ui.muted)} style={{ display: 'block' }}>{member.email}</span>
                    <span className={s.perms}>
                      {member.role === 'owner' ? <Badge tone="brand">Dono</Badge> : member.permissions.map((p) => <Badge key={p}>{PERM_LABEL[p] ?? p}</Badge>)}
                    </span>
                  </span>
                </span>
                {member.role === 'owner' ? null : (
                  <span className={ui.row} style={{ flexWrap: 'nowrap' }}>
                    <span className="wb-text-caption">{member.status === 'active' ? 'Ativo' : `Convite enviado${member.inviteExpiresAt ? ` · vence em ${formatDay(member.inviteExpiresAt)}` : ''}`}</span>
                    <ActionMenu
                      label={`Ações de ${member.name}`}
                      testId={T(`member-${member.id}-menu`)}
                      actions={
                        member.status === 'active'
                          ? [
                              { label: 'Editar permissões', onSelect: () => setEditing(member) },
                              { label: 'Remover da equipe', danger: true, onSelect: () => setRemoving(member) },
                            ]
                          : [
                              {
                                label: 'Cancelar convite',
                                danger: true,
                                onSelect: () => {
                                  void guard(() => merchantApi.revokeInvitation(store!.id, member.id), 'Digite sua senha para cancelar o convite.')
                                    .then(() => refresh())
                                    .then(() => toast.show('Convite cancelado.'))
                                    .catch((caught) => inviteError(caught) && toast.show(inviteError(caught)));
                                },
                              },
                            ]
                      }
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>

      {inviting && store ? (
        <InviteDialog
          onClose={() => setInviting(false)}
          onSend={async (body) => {
            await guard(() => merchantApi.invite(store.id, body), 'Digite sua senha para convidar um funcionário.');
            await refresh();
            toast.show(`Convite enviado para ${body.email}.`);
          }}
        />
      ) : null}
      {editing && store ? (
        <PermissionsDialog
          member={editing}
          onClose={() => setEditing(null)}
          onSave={async (permissions) => {
            await guard(() => merchantApi.setPermissions(store.id, editing.id, permissions), 'Digite sua senha para mudar as permissões.');
            await refresh();
            toast.show('Permissões salvas.');
          }}
        />
      ) : null}
      {removing && store ? (
        <RemoveDialog
          member={removing}
          onClose={() => setRemoving(null)}
          onRemove={async () => {
            await guard(() => merchantApi.removeMember(store.id, removing.id), 'Digite sua senha para remover da equipe.');
            await refresh();
            toast.show(`${removing.name.split(' ')[0]} foi removido.`);
          }}
        />
      ) : null}
    </div>
  );
}

function PermissionBoxes({ value, onChange, legend }: { value: string[]; onChange: (next: string[]) => void; legend: string }) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="wb-text-caption-strong">{legend}</legend>
      {STAFF_PERMISSIONS.map((permission) => (
        <CheckboxField key={permission.id} label={permission.label} checked={value.includes(permission.id)} onChange={(e) => onChange(e.target.checked ? [...value, permission.id] : value.filter((p) => p !== permission.id))} data-testid={T(`perm-${permission.id}`)} />
      ))}
    </fieldset>
  );
}

function useSubmit(action: () => Promise<void>, onClose: () => void, precheck?: () => boolean) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (precheck && !precheck()) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (caught) {
      setBusy(false);
      const message = inviteError(caught);
      if (message) setError(message);
    }
  }
  return { busy, error, run };
}

function InviteDialog({ onClose, onSend }: { onClose: () => void; onSend: (body: { email: string; name: string; permissions: string[] }) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['orders']);
  const [errors, setErrors] = useState<{ email?: string; name?: string }>({});
  const submit = useSubmit(
    () => onSend({ email: email.trim(), name: name.trim(), permissions }),
    onClose,
    () => {
      const next: typeof errors = {};
      if (!isEmailLike(email)) next.email = 'Confira o e-mail.';
      if (name.trim().length < 2) next.name = 'Digite o nome de quem vai entrar.';
      setErrors(next);
      return Object.keys(next).length === 0;
    },
  );
  return (
    <Dialog
      title="Convidar funcionário"
      onClose={onClose}
      locked={submit.busy}
      testId={T('invite-dialog')}
      actions={
        <>
          <Button loading={submit.busy} loadingLabel="Enviando…" onClick={() => void submit.run()} data-testid={T('invite-submit')}>Enviar convite</Button>
          <Button variant="text" onClick={onClose} disabled={submit.busy}>Cancelar</Button>
        </>
      }
    >
      <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="off" data-testid={T('invite-email-input')} />
      <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="off" data-testid={T('invite-name-input')} />
      <PermissionBoxes value={permissions} onChange={setPermissions} legend="Permissões" />
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>O funcionário nunca vê financeiro, conta de recebimento, equipe nem configurações da loja. O link vale 7 dias.</p>
      {submit.error ? <Banner tone="danger" testId={T('invite-error')}>{submit.error}</Banner> : null}
    </Dialog>
  );
}

function PermissionsDialog({ member, onClose, onSave }: { member: TeamMember; onClose: () => void; onSave: (permissions: string[]) => Promise<void> }) {
  const [permissions, setPermissions] = useState(member.permissions);
  const submit = useSubmit(() => onSave(permissions), onClose);
  return (
    <Dialog
      title={`Permissões de ${member.name.split(' ')[0]}`}
      onClose={onClose}
      locked={submit.busy}
      actions={
        <>
          <Button loading={submit.busy} loadingLabel="Salvando…" onClick={() => void submit.run()} data-testid={T('permissions-submit')}>Salvar permissões</Button>
          <Button variant="text" onClick={onClose} disabled={submit.busy}>Cancelar</Button>
        </>
      }
    >
      <PermissionBoxes value={permissions} onChange={setPermissions} legend={`Permissões de ${member.name.split(' ')[0]}`} />
      {submit.error ? <Banner tone="danger">{submit.error}</Banner> : null}
    </Dialog>
  );
}

function RemoveDialog({ member, onClose, onRemove }: { member: TeamMember; onClose: () => void; onRemove: () => Promise<void> }) {
  const first = member.name.split(' ')[0];
  const submit = useSubmit(onRemove, onClose);
  return (
    <Dialog
      title={`Remover ${first}?`}
      onClose={onClose}
      locked={submit.busy}
      alert
      actions={
        <>
          <Button variant="destructive" loading={submit.busy} loadingLabel="Removendo…" onClick={() => void submit.run()} data-testid={T('remove-confirm')}>Remover da equipe</Button>
          <Button variant="text" onClick={onClose} disabled={submit.busy}>Cancelar</Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>{first} perde o acesso agora.</p>
      {submit.error ? <Banner tone="danger">{submit.error}</Banner> : null}
    </Dialog>
  );
}
