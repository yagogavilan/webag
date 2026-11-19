'use client';

import { Motorcycle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, CheckboxField, Dialog, EmptyState, ErrorState, SkeletonRows, Switch, TextField, cx, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { logisticsApi, logisticsKeys, type Courier } from '@/lib/api/logistics';
import { formatPhone } from '@/lib/orders/status';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './logistics.module.css';

const T = (id: string) => tid('logistica', `drivers.${id}`);

/** Telefone com DDD: 10 ou 11 dígitos (aceita o 55 na frente). */
export function courierPhoneDigits(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11 ? `55${national}` : null;
}

function courierError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'Conecte-se para salvar. O que você digitou continua aqui.';
    if (error.code === 'COURIER_PHONE_IN_USE') return 'Esse celular já é de outro motoboy ativo.';
    if (error.code === 'COURIER_HAS_ACTIVE_DELIVERIES') return 'Esse motoboy tem corrida em andamento. Troque o motoboy antes.';
    if (error.status === 403) return 'Você não tem permissão para esta ação.';
    if (error.status === 422 && error.detail) return error.detail;
  }
  return 'Não foi possível salvar. O que você digitou continua aqui.';
}

export function CouriersTab({ canWrite }: { canWrite: boolean }) {
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: logisticsKeys.couriers, queryFn: () => logisticsApi.couriers({ limit: 100 }) });
  const [editing, setEditing] = useState<Courier | 'new' | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function toggle(courier: Courier, active: boolean) {
    setRowError((prev) => ({ ...prev, [courier.id]: '' }));
    try {
      await logisticsApi.updateCourier(courier.id, { active });
      toast.show(active ? `${courier.name} reativado.` : `${courier.name} desativado.`);
    } catch (error) {
      setRowError((prev) => ({ ...prev, [courier.id]: courierError(error) }));
    } finally {
      void client.invalidateQueries({ queryKey: logisticsKeys.couriers });
    }
  }

  if (query.isPending) return <SkeletonRows rows={4} height={72} label="Carregando os motoboys" />;
  if (query.isError && !query.data) return <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />;
  const list = query.data?.data ?? [];
  return (
    <>
      {canWrite ? (
        <div className={s.actions}>
          <Button onClick={() => setEditing('new')} data-testid={T('add')}>Adicionar motoboy</Button>
        </div>
      ) : null}
      {list.length === 0 ? (
        <EmptyState icon={Motorcycle} title="Nenhum motoboy cadastrado" text="Cadastre quem entrega para despachar mais rápido." actionLabel={canWrite ? 'Adicionar motoboy' : undefined} onAction={canWrite ? () => setEditing('new') : undefined} testId={T('empty')} />
      ) : (
        <ul className={s.couriers} data-testid={T('list')}>
          {list.map((courier) => (
            <li key={courier.id} className={s.courier} data-testid={T(`item-${courier.id}`)}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="wb-text-body-strong">{courier.name}</span>
                <span className={cx('wb-text-caption', s.muted)}>{formatPhone(courier.phone)} · {courier.deliveriesLast7Days ?? 0} corridas em 7 dias{courier.busyNow ? ' · em corrida' : ''}</span>
                {rowError[courier.id] ? <span className="wb-text-caption" role="alert" style={{ color: 'var(--wb-color-text-danger)' }}>{rowError[courier.id]}</span> : null}
              </span>
              <span className={s.actions}>
                {canWrite ? <Button size="sm" variant="secondary" onClick={() => setEditing(courier)} aria-label={`Editar ${courier.name}`}>Editar</Button> : null}
                <Switch checked={courier.active} onChange={(value) => void toggle(courier, value)} label={`${courier.name}, ${courier.active ? 'ativo' : 'inativo'}`} onText="Ativo" offText="Inativo" disabled={!canWrite} testId={T(`item-${courier.id}-switch`)} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing ? <CourierForm courier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function CourierForm({ courier, onClose }: { courier: Courier | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(courier?.name ?? '');
  const [phone, setPhone] = useState(courier ? formatPhone(courier.phone) : '');
  const [note, setNote] = useState(courier?.note ?? '');
  const [checked, setChecked] = useState(Boolean(courier));
  const [errors, setErrors] = useState<{ name?: string; phone?: string; checked?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Escreva o nome do motoboy.';
    const digits = courierPhoneDigits(phone);
    if (!digits) next.phone = 'Confira o celular com DDD.';
    if (!courier && !checked) next.checked = 'Confirme que os documentos foram conferidos.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !digits) return;
    setBusy(true);
    setError(null);
    try {
      if (courier) await logisticsApi.updateCourier(courier.id, { name: name.trim(), phone: digits, note: note.trim() || null });
      else await logisticsApi.createCourier({ name: name.trim(), phone: digits, note: note.trim() || null, documentsChecked: true });
      toast.show(courier ? `${name.trim()} atualizado.` : `${name.trim()} cadastrado.`);
      void client.invalidateQueries({ queryKey: logisticsKeys.couriers });
      onClose();
    } catch (caught) {
      setError(courierError(caught));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={courier ? 'Editar motoboy' : 'Adicionar motoboy'}
      onClose={onClose}
      locked={busy}
      testId={T('form')}
      actions={
        <>
          <Button size="lg" onClick={() => void submit()} loading={busy} loadingLabel="Salvando…" data-testid={T('submit')}>Salvar motoboy</Button>
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        </>
      }
    >
      <TextField label="Nome" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} autoComplete="off" data-testid={T('name-input')} />
      <TextField label="Celular com WhatsApp" inputMode="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} error={errors.phone} data-testid={T('phone-input')} />
      <TextField label="Observação (opcional)" value={note} maxLength={100} onChange={(event) => setNote(event.target.value)} hint="Ex.: moto vermelha" data-testid={T('note-input')} />
      {courier ? null : <CheckboxField label="Documentos conferidos fora do app" checked={checked} onChange={(event) => setChecked(event.target.checked)} error={errors.checked} data-testid={T('documents-checked')} />}
      <p className="wb-text-caption" style={{ margin: 0 }}>Usamos nome e celular só para despachar entregas e registrar o custo.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
