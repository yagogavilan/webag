'use client';

import { CaretDown, CaretRight, MagnifyingGlass, PencilSimple, Scales } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import s from '@/components/panel/panel.module.css';
import { PageHeader } from '@/components/panel/page-header';
import { REASON_MAX, ReasonDialog, reasonError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { SplitLayout } from '@/components/panel/split-layout';
import { Badge, Banner, Button, ButtonLink, EmptyState, NoAccessState, QueryBoundary, SelectField, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import { adminApi, keys, type Parameter } from '@/lib/api/admin';
import { asRoute } from '@/lib/routes';
import { formatClock } from '@/lib/format';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { tid } from '@/lib/testid';
import { FINANCE_OWNED, GROUPS, etaParamsFrom, formatParamValue, groupOf, isChanged, parseInput, rangeText, toInput } from './catalog';
import { EtaSimulator } from './eta-simulator';

const T = (id: string) => tid('parametros', id);

function ParamRow({ param, selected, onSelect }: { param: Parameter; selected: boolean; onSelect: () => void }) {
  const range = rangeText(param);
  return (
    <li className={cx(s.listItem, selected && s.listItemSelected)} data-testid={T(`param-${param.key}`)}>
      <button type="button" className={s.listItemMain} onClick={onSelect} aria-label={`Editar ${param.description}`} data-testid={T(`param-${param.key}-edit`)}>
        <span className="wb-text-body">{param.description}</span>
        <span className="wb-text-body-strong">{formatParamValue(param.key, param.value)}</span>
        <span className={cx('wb-text-caption', ui.muted)}>Padrão {formatParamValue(param.key, param.default)}{range ? ` · ${range}` : ''}</span>
        <span className={cx('wb-text-caption', ui.muted)}>{param.key}</span>
      </button>
      {param.legalFloor ? <Badge tone="info" icon={<Scales size={16} aria-hidden="true" />}>Lei</Badge> : isChanged(param) ? <Badge tone="brand" icon={<PencilSimple size={16} aria-hidden="true" />}>Alterado</Badge> : null}
    </li>
  );
}

function EditPanel({ param, canAudit, onSaved }: { param: Parameter; canAudit: boolean; onSaved: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(toInput(param));
  const [reason, setReason] = useState('');
  const [valueError, setValueError] = useState<string | undefined>();
  const [reasonErr, setReasonErr] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [conflict, setConflict] = useState<Parameter | null>(null);
  const locked = param.legalFloor;
  const finance = FINANCE_OWNED.has(param.key);
  const readOnly = locked || finance;
  const range = rangeText(param);

  const save = useMutation({
    mutationFn: (value: string | number) => adminApi.updateParameter(param.key, value, reason.trim()),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.parameters });
      toast.show('Parâmetro salvo. Registrado na auditoria.');
      setReason('');
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void showConflict();
      else if (error instanceof ApiError && (error.code === 'PARAMETER_OUT_OF_RANGE' || error.code === 'PARAMETER_LOCKED')) setValueError(error.fieldMessage('value') ?? error.detail);
      else setFormError(error instanceof ApiError && error.status >= 500 ? 'Não foi possível salvar. O valor anterior continua valendo.' : saveErrorMessage(error));
    },
  });

  /** Concorrência (AD0): outro admin mudou o item depois que o painel abriu. Mostra o aviso e deixa ver o valor atual. */
  async function showConflict() {
    const fresh = await adminApi.parameters().catch(() => null);
    setConflict(fresh?.data.find((p) => p.key === param.key) ?? param);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseInput(param, text);
    const vError = 'error' in parsed ? parsed.error : undefined;
    const rError = reasonError(reason);
    setValueError(vError);
    setReasonErr(rError);
    if (vError || rError || 'error' in parsed) return;
    // Enquanto a API não confirma a versão no PUT (pendência), confere antes de enviar se o item mudou desde que o painel abriu.
    const fresh = await adminApi.parameters().catch(() => null);
    const current = fresh?.data.find((p) => p.key === param.key);
    if (current && current.updatedAt !== param.updatedAt) {
      setConflict(current);
      return;
    }
    save.mutate(parsed.value);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={ui.stack} noValidate>
      <p className="wb-text-body" style={{ margin: 0 }}>{param.description}</p>
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>{param.key}</p>
      {locked ? (
        <Banner tone="warning" testId={T('legal-banner')}>
          Esse prazo é o mínimo previsto no Código de Defesa do Consumidor e não pode ser alterado aqui.
        </Banner>
      ) : null}
      {finance ? <Banner tone="info">Comissão e taxa de serviço são editadas em Financeiro &gt; Comissões (chega com a tela de financeiro). Aqui só leitura.</Banner> : null}
      {param.type === 'enum' ? (
        <SelectField label="Valor" value={text} onChange={(e) => setText(e.target.value)} disabled={readOnly} data-testid={T('value-input')}>
          {param.values?.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </SelectField>
      ) : (
        <TextField label="Valor" value={text} onChange={(e) => setText(e.target.value)} disabled={readOnly} inputMode={param.type === 'window' ? 'text' : 'decimal'} error={valueError} hint={`Padrão ${formatParamValue(param.key, param.default)}${range ? ` · ${range}` : ''}`} autoComplete="off" data-testid={T('value-input')} />
      )}
      {conflict ? (
        <Banner
          tone="warning"
          testId={T('conflict')}
          action={
            <Button size="sm" variant="secondary" onClick={() => void client.invalidateQueries({ queryKey: keys.parameters }).then(onSaved)} data-testid={T('conflict-reload')}>
              Ver valor atual
            </Button>
          }
        >
          {conflict.updatedAt ? `Outra pessoa alterou isso às ${formatClock(conflict.updatedAt)}.` : 'Outra pessoa alterou isso.'} Veja o valor atual antes de salvar.
        </Banner>
      ) : null}
      {!readOnly ? (
        <>
          <TextArea label="Motivo" value={reason} onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))} counter={{ value: reason.length, max: REASON_MAX }} error={reasonErr} rows={3} data-testid={T('reason-input')} />
          <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Vale a partir de agora. Pedidos já feitos mantêm as regras da época.</p>
          {formError ? <Banner tone="danger" testId={T('save-error')}>{formError}</Banner> : null}
          <Button type="submit" loading={save.isPending} loadingLabel="Salvando…" data-testid={T('submit')}>Salvar parâmetro</Button>
          {isChanged(param) ? (
            <Button variant="text" onClick={() => setRestoring(true)} data-testid={T('restore-default')}>Restaurar padrão ({formatParamValue(param.key, param.default)})</Button>
          ) : null}
        </>
      ) : null}
      {canAudit ? (
        <Link href={asRoute(`/admin/auditoria?targetType=parameter&targetId=${encodeURIComponent(param.key)}`)} className="wb-text-body" data-testid={T('history-link')}>
          Ver histórico
        </Link>
      ) : null}
      {restoring ? (
        <ReasonDialog
          title="Restaurar o padrão?"
          description={`O valor volta para ${formatParamValue(param.key, param.default)}.`}
          confirmLabel="Restaurar"
          onConfirm={async (why) => {
            await adminApi.resetParameter(param.key, why);
            await client.invalidateQueries({ queryKey: keys.parameters });
            toast.show('Parâmetro restaurado. Registrado na auditoria.');
            onSaved();
          }}
          onClose={() => setRestoring(false)}
          testIds={{ confirm: T('restore-confirm'), reason: T('restore-reason-input') }}
        />
      ) : null}
    </form>
  );
}

export function ParametersPage() {
  const { canView } = useSession();
  const query = useQuery({ queryKey: keys.parameters, queryFn: adminApi.parameters });
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  if (!canView('parametros')) return <NoAccessState />;

  const term = search.trim().toLowerCase();
  return (
    <>
      <PageHeader title="Parâmetros do negócio" description="Ajuste uma regra sem pedir deploy. Toda mudança fica na auditoria." action={canView('parametros_entrega') ? <ButtonLink href={asRoute('/admin/parametros/entrega')} variant="secondary" data-testid={T('delivery-link')}>Parâmetros de entrega</ButtonLink> : undefined} />
      <QueryBoundary query={query} skeletonLabel="Carregando parâmetros" skeleton={<div data-testid="skeleton"><span className={ui.srOnly} role="status">Carregando parâmetros</span><div className={ui.skeletonList}>{Array.from({ length: 8 }, (_, i) => <span key={i} className={ui.skeleton} style={{ height: 72 }} aria-hidden="true" />)}</div></div>}>
        {(page) => {
          const filtered = page.data.filter((p) => !term || p.description.toLowerCase().includes(term) || p.key.toLowerCase().includes(term));
          const selected = page.data.find((p) => p.key === selectedKey) ?? null;
          const etaCfg = etaParamsFrom(page.data);
          const raioMax = page.data.find((p) => p.key === 'raio_max_km');
          return (
            <SplitLayout
              panelOpen={selected !== null}
              onClosePanel={() => setSelectedKey(null)}
              panelTitle={selected ? 'Editar parâmetro' : ''}
              list={
                <div className={ui.stack}>
                  <TextField label="Buscar parâmetro" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" data-testid={T('search-input')} />
                  {etaCfg && !term ? <EtaSimulator cfg={etaCfg} radiusMaxKm={typeof raioMax?.value === 'number' ? raioMax.value : null} /> : null}
                  {filtered.length === 0 ? (
                    <EmptyState icon={MagnifyingGlass} title="Nenhum parâmetro com esse nome." text="Confira a escrita ou tente uma palavra mais simples." actionLabel="Limpar busca" onAction={() => setSearch('')} />
                  ) : (
                    GROUPS.map((group) => {
                      const items = filtered.filter((p) => groupOf(p.key) === group.id);
                      if (items.length === 0) return null;
                      const open = Boolean(term) || !collapsed.has(group.id);
                      const regionId = `group-${group.id}`;
                      return (
                        <section key={group.id} className={s.group} data-testid={T(`group-${group.id}`)}>
                          <h2 className={cx('wb-text-title2', s.groupTitle)}>
                            <button type="button" className={s.groupHeader} aria-expanded={open} aria-controls={regionId} onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}>
                              <span>{group.label} <span className={cx('wb-text-caption', ui.muted)}>({items.length})</span></span>
                              {open ? <CaretDown size={20} aria-hidden="true" /> : <CaretRight size={20} aria-hidden="true" />}
                            </button>
                          </h2>
                          {open ? (
                            <ul id={regionId} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                              {items.map((p) => (
                                <ParamRow key={p.key} param={p} selected={p.key === selectedKey} onSelect={() => setSelectedKey(p.key)} />
                              ))}
                            </ul>
                          ) : null}
                        </section>
                      );
                    })
                  )}
                </div>
              }
              panel={selected ? <EditPanel key={`${selected.key}-${String(selected.value)}-${selected.updatedAt ?? ''}-${reloads}`} param={selected} canAudit={canView('auditoria')} onSaved={() => setReloads((n) => n + 1)} /> : null}
            />
          );
        }}
      </QueryBoundary>
    </>
  );
}
