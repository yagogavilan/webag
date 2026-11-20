'use client';

import { ArrowLeft, Hourglass, MapPin } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, Dialog, EmptyState, MessageState, NoAccessState, QueryBoundary, Switch, TabPanel, Tabs, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import { adminApi, keys, type City, type Neighborhood } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { tid } from '@/lib/testid';
import { CityStatusSwitch, useToggleActive } from './regions-page';

const T = (id: string) => tid('regioes', id);

/** Linhas coladas: uma por linha, sem vazias, sem repetidas (ignora caixa) e marcando as que já existem. */
export function parseBulk(text: string, existing: string[]): { name: string; duplicate: boolean }[] {
  const known = new Set(existing.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  const rows: { name: string; duplicate: boolean }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    rows.push({ name, duplicate: known.has(key) || seen.has(key) });
    seen.add(key);
  }
  return rows;
}

function NeighborhoodRow({ hood }: { hood: Neighborhood }) {
  const toggle = useToggleActive();
  const toast = useToast();
  const { canEdit } = useSession();
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);

  async function change(next: boolean) {
    if (!next) return setClosing(true);
    setBusy(true);
    try {
      await toggle('neighborhood', hood.id, hood.name, true);
    } catch {
      toast.show('Não foi possível alterar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="wb-text-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 56, borderBottom: '1px solid var(--wb-color-border-subtle)' }}>
      <span>{hood.name}</span>
      <Switch checked={hood.active} onChange={(next) => void change(next)} label={hood.name} busy={busy} disabled={!canEdit('regioes')} testId={T(`neighborhood-${hood.id}-switch`)} />
      {closing ? (
        <ReasonDialog title={`Fechar ${hood.name}?`} description="O app deixa de mostrar lojas ali e novos pedidos nessa região são bloqueados. Pedidos em andamento seguem." withReason={false} confirmLabel="Fechar bairro" destructive onConfirm={() => toggle('neighborhood', hood.id, hood.name, false)} onClose={() => setClosing(false)} testIds={{ dialog: T('close-reason'), confirm: T('close-confirm') }} />
      ) : null}
    </li>
  );
}

function BulkDialog({ city, onClose }: { city: City; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => parseBulk(text, city.neighborhoods.map((n) => n.name)), [text, city.neighborhoods]);
  const fresh = rows.filter((r) => !r.duplicate);

  async function submit() {
    if (fresh.length === 0) return setError('Cole ao menos um bairro novo, um por linha.');
    setBusy(true);
    setError(null);
    let added = 0;
    try {
      for (const row of fresh) {
        await adminApi.createNeighborhood(city.id, { name: row.name, active: true });
        added += 1;
      }
      toast.show(`${added} ${added === 1 ? 'bairro adicionado' : 'bairros adicionados'}.`);
      await client.invalidateQueries({ queryKey: keys.cities });
      onClose();
    } catch (caught) {
      await client.invalidateQueries({ queryKey: keys.cities });
      setError(`${added > 0 ? `${added} adicionados antes do erro. ` : ''}${saveErrorMessage(caught)}`);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Adicionar vários bairros" onClose={onClose} locked={busy} wide testId={T('neighborhood-bulk-dialog')} actions={<><Button onClick={() => void submit()} loading={busy} loadingLabel="Adicionando…" disabled={rows.length === 0} data-testid={T('neighborhood-bulk-submit')}>{fresh.length > 0 ? `Adicionar ${fresh.length} ${fresh.length === 1 ? 'bairro' : 'bairros'}` : 'Adicionar bairros'}</Button><Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <TextArea label="Um bairro por linha" value={text} onChange={(e) => setText(e.target.value)} rows={6} data-testid={T('neighborhood-bulk-input')} />
      {rows.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 20 }} aria-label="Prévia" data-testid={T('neighborhood-bulk-preview')}>
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`} className="wb-text-body">{row.name}{row.duplicate ? <> <Badge tone="warning">Já existe, será ignorado</Badge></> : null}</li>
          ))}
        </ul>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}

function Neighborhoods({ city, editable }: { city: City; editable: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return setError('Digite o nome do bairro.');
    setBusy(true);
    setError(undefined);
    try {
      await adminApi.createNeighborhood(city.id, { name: trimmed, active: true });
      await client.invalidateQueries({ queryKey: keys.cities });
      setName('');
      toast.show('Bairro adicionado.');
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === 'NEIGHBORHOOD_EXISTS' ? 'Esse bairro já está na lista.' : saveErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={ui.stack}>
      <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>Bairro que você não cadastrar segue a regra da cidade.</p>
      {editable ? (
        <form onSubmit={add} className={ui.row} style={{ alignItems: 'flex-start' }} noValidate>
          <TextField label="Novo bairro" value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={80} autoComplete="off" style={{ minWidth: 240 }} data-testid={T('neighborhood-input')} />
          <Button type="submit" loading={busy} loadingLabel="Adicionando…" style={{ marginTop: 24 }} data-testid={T('neighborhood-add')}>Adicionar bairro</Button>
          <Button variant="secondary" onClick={() => setBulk(true)} style={{ marginTop: 24 }} data-testid={T('neighborhood-bulk-open')}>Adicionar vários</Button>
        </form>
      ) : null}
      {city.neighborhoods.length === 0 ? (
        <EmptyState icon={MapPin} title="Nenhum bairro cadastrado" text="A cidade inteira segue a mesma regra. Cadastre bairros só se quiser abrir um de cada vez." />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Bairros">
          {city.neighborhoods.map((hood) => (
            <NeighborhoodRow key={hood.id} hood={hood} />
          ))}
        </ul>
      )}
      {bulk ? <BulkDialog city={city} onClose={() => setBulk(false)} /> : null}
    </div>
  );
}

export function CityDetail({ id }: { id: string }) {
  const { canView, canEdit } = useSession();
  const query = useQuery({ queryKey: keys.cities, queryFn: adminApi.cities });
  const [tab, setTab] = useState<'neighborhoods' | 'waitlist'>('neighborhoods');
  if (!canView('regioes')) return <NoAccessState />;

  return (
    <QueryBoundary query={query} skeletonLabel="Carregando cidade">
      {(page) => {
        const city = page.data.find((c) => c.id === id);
        if (!city) {
          return <MessageState icon={MapPin} title="Cidade não encontrada" text="Ela pode ter sido removida. Volte para a lista de regiões." testId={T('not-found')}><Link href="/admin/regioes" className={cx('wb-text-body', ui.muted)}>Voltar às regiões</Link></MessageState>;
        }
        const activeCount = city.neighborhoods.filter((n) => n.active).length;
        return (
          <>
            <Link href="/admin/regioes" className="wb-text-body" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 48 }}>
              <ArrowLeft size={20} aria-hidden="true" /> Regiões
            </Link>
            <PageHeader title={`${city.name} (${city.state})`} description={`${city.neighborhoods.length} bairros, ${activeCount} ativos`} action={<CityStatusSwitch city={city} />} />
            <Tabs label="Seções da cidade" value={tab} onChange={setTab} tabs={[{ id: 'neighborhoods', label: 'Bairros' }, { id: 'waitlist', label: 'Lista de espera', testId: T('waitlist-tab') }]} />
            <TabPanel id={tab}>
              {tab === 'neighborhoods' ? (
                <Neighborhoods city={city} editable={canEdit('regioes')} />
              ) : (
                <EmptyState icon={Hourglass} title="Lista de espera indisponível" text="Quando a lista de espera do app existir, o total por bairro aparece aqui, sem nomes nem e-mails." testId={T('waitlist-empty')} />
              )}
            </TabPanel>
          </>
        );
      }}
    </QueryBoundary>
  );
}
