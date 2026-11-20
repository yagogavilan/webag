'use client';

import { MapPin, Plus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, ButtonLink, Dialog, EmptyState, NoAccessState, QueryBoundary, SelectField, Switch, TextField, cx, ui, useToast, CheckboxField } from '@/components/ui';
import { adminApi, keys, type City } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { UFS } from '@/lib/ufs';

const T = (id: string) => tid('regioes', id);

/** Cadastro de cidade (AD1). Erros: "Digite o nome da cidade." e "Essa cidade já está na lista.". */
function AddCityDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [state, setState] = useState('SP');
  const [active, setActive] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.createCity({ name: name.trim(), state, active }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.cities });
      toast.show('Cidade adicionada.');
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CITY_EXISTS') setNameError('Essa cidade já está na lista.');
      else if (error instanceof ApiError && error.status === 400) setNameError(error.fieldMessage('name') ?? 'Digite o nome da cidade.');
      else setFormError(saveErrorMessage(error));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return setNameError('Digite o nome da cidade.');
    setNameError(undefined);
    create.mutate();
  }

  return (
    <Dialog title="Adicionar cidade" onClose={onClose} locked={create.isPending} testId={T('add-city-dialog')}>
      <form onSubmit={submit} className={ui.stack} noValidate>
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={nameError} maxLength={60} autoComplete="off" data-testid={T('city-name-input')} />
        <SelectField label="UF" value={state} onChange={(e) => setState(e.target.value)} data-testid={T('city-state-select')}>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>{uf}</option>
          ))}
        </SelectField>
        <CheckboxField label="Começar ativa" checked={active} onChange={(e) => setActive(e.target.checked)} data-testid={T('city-active-checkbox')} />
        {formError ? <Banner tone="danger">{formError}</Banner> : null}
        <div className={ui.dialogActions}>
          <Button type="submit" loading={create.isPending} loadingLabel="Adicionando…" data-testid={T('city-submit')}>Adicionar cidade</Button>
          <Button variant="text" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Alterna o status de uma cidade/bairro. Fechar pede confirmação (ReasonDialog); abrir é direto. */
export function useToggleActive() {
  const client = useQueryClient();
  const toast = useToast();
  return async (kind: 'city' | 'neighborhood', id: string, label: string, next: boolean) => {
    if (kind === 'city') await adminApi.updateCity(id, { active: next });
    else await adminApi.updateNeighborhood(id, { active: next });
    await client.invalidateQueries({ queryKey: keys.cities });
    const message = kind === 'city' ? (next ? `${label} ativada.` : `${label} fechada.`) : next ? `${label} ativado.` : `${label} fechado.`;
    toast.show(message);
  };
}

export function CityStatusSwitch({ city }: { city: City }) {
  const toggle = useToggleActive();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const { canEdit } = useSession();
  const editable = canEdit('regioes');

  async function change(next: boolean) {
    if (!next) return setClosing(true);
    setBusy(true);
    try {
      await toggle('city', city.id, city.name, true);
    } catch (error) {
      toast.show(error instanceof ApiError && error.isNetwork ? 'Conecte-se para alterar.' : 'Não foi possível alterar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Switch checked={city.active} onChange={(next) => void change(next)} label={city.name} busy={busy} disabled={!editable} testId={T(`city-${city.id}-switch`)} />
      {closing ? (
        <ReasonDialog
          title={`Fechar ${city.name}?`}
          description="O app deixa de mostrar lojas ali e novos pedidos nessa região são bloqueados. Pedidos em andamento seguem."
          withReason={false}
          confirmLabel="Fechar cidade"
          destructive
          onConfirm={() => toggle('city', city.id, city.name, false)}
          onClose={() => setClosing(false)}
          testIds={{ dialog: T('close-reason'), confirm: T('close-confirm') }}
        />
      ) : null}
    </>
  );
}

export function RegionsPage() {
  const { canView, canEdit } = useSession();
  const query = useQuery({ queryKey: keys.cities, queryFn: adminApi.cities });
  const [adding, setAdding] = useState(false);
  if (!canView('regioes')) return <NoAccessState />;
  const editable = canEdit('regioes');

  return (
    <>
      <PageHeader title="Regiões" description="Cidades e bairros em que o app entrega." action={editable ? <Button icon={<Plus size={20} aria-hidden="true" />} onClick={() => setAdding(true)} data-testid={T('add-city')}>Adicionar cidade</Button> : undefined} />
      <QueryBoundary
        query={query}
        skeletonLabel="Carregando cidades"
        empty={(page) =>
          page.data.length === 0 ? <EmptyState icon={MapPin} title="Nenhuma cidade cadastrada" text="Cadastre a primeira para o app saber onde entregar." actionLabel={editable ? 'Adicionar cidade' : undefined} onAction={() => setAdding(true)} testId={T('empty')} /> : null
        }
      >
        {(page) => (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="wb-text-caption">Cidades atendidas</caption>
              <thead>
                <tr>
                  <th scope="col">Cidade</th>
                  <th scope="col">Status</th>
                  <th scope="col">Bairros</th>
                  <th scope="col"><span className={ui.srOnly}>Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((city) => {
                  const activeCount = city.neighborhoods.filter((n) => n.active).length;
                  return (
                    <tr key={city.id} data-testid={T(`city-${city.id}`)}>
                      <td data-primary className="wb-text-body-strong">{city.name} ({city.state})</td>
                      <td data-label="Status"><CityStatusSwitch city={city} /></td>
                      <td data-label="Bairros" className={cx('wb-text-body', ui.mono)}>{city.neighborhoods.length === 0 ? 'Nenhum cadastrado' : `${activeCount} de ${city.neighborhoods.length} ativos`}</td>
                      <td>
                        <ButtonLink href={asRoute(`/admin/regioes/${city.id}`)} variant="secondary" size="sm" aria-label={`Abrir ${city.name}`} data-testid={T(`city-${city.id}-open`)}>Abrir</ButtonLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
      {adding ? <AddCityDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}

