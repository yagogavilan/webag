'use client';

import { MapTrifold } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useReauth } from '@/components/panel/reauth';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, Dialog, EmptyState, ErrorState, NoAccessState, SkeletonRows, TextField, TextArea, useToast } from '@/components/ui';
import { adminFinanceApi, financeAdminKeys, type FeeTable, type Tier } from '@/lib/api/admin-finance';
import { ApiError } from '@/lib/api/errors';
import { formatCents, formatDateTime } from '@/lib/format';
import { parseCents } from '@/lib/money';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './admin-finance.module.css';

const T = (id: string) => tid('frete', id);
const MAX_TIERS = 6;
const MAX_FEE_CENTS = 5000;

interface Draft {
  toKm: string;
  fee: string;
  exchangeFee: string;
  cost: string;
  eta: string;
}

const reais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const km = (m: number) => String(m / 1000).replace('.', ',');
const scopeLabel = (table: Pick<FeeTable, 'scopeType' | 'scopeName'>) => (table.scopeType === 'default' ? 'Padrão geral' : (table.scopeName ?? (table.scopeType === 'city' ? 'Cidade' : 'Bairro')));

/** Valida as faixas e devolve as faixas em unidades da API, ou a mensagem do primeiro erro. As faixas são contíguas a partir de 0. */
export function buildTiers(drafts: Draft[]): { tiers: Tier[] } | { error: string } {
  if (drafts.length === 0) return { error: 'Adicione ao menos uma faixa.' };
  const tiers: Tier[] = [];
  let from = 0;
  for (const [index, draft] of drafts.entries()) {
    const label = `Faixa ${index + 1}`;
    const toKm = Number(draft.toKm.replace(',', '.'));
    if (!Number.isFinite(toKm) || toKm <= 0) return { error: `${label}: informe até quantos km.` };
    const toM = Math.round(toKm * 1000);
    if (toM <= from) return { error: `${label}: o fim precisa ser maior que o começo (${km(from)} km).` };
    const fee = parseCents(draft.fee);
    if (fee === null || fee > MAX_FEE_CENTS) return { error: `${label}: a taxa de entrega vai de R$ 0,00 a R$ 50,00.` };
    const exchange = draft.exchangeFee.trim() === '' ? Math.round(fee / 2) : parseCents(draft.exchangeFee);
    if (exchange === null) return { error: `${label}: confira a taxa de troca.` };
    const cost = draft.cost.trim() === '' ? 0 : parseCents(draft.cost);
    if (cost === null) return { error: `${label}: confira o custo previsto.` };
    const eta = Number(draft.eta);
    if (!Number.isInteger(eta) || eta < 0) return { error: `${label}: informe o prazo em minutos.` };
    tiers.push({ fromM: from, toM, feeCents: fee, exchangeFeeCents: exchange, expectedCostCents: cost, etaMinutes: eta });
    from = toM;
  }
  return { tiers };
}

/** Frete por região (DEC-036a): a taxa é da Webag, vem do destino. Cada gravação cria uma versão nova; conflito de versão avisa. */
export function FeeTablesPage() {
  const { canView, canEdit } = useSession();
  const online = useOnline();
  const query = useQuery({ queryKey: financeAdminKeys.fees, queryFn: adminFinanceApi.feeTables, enabled: canView('frete') });
  const [editing, setEditing] = useState<FeeTable | 'new-default' | null>(null);
  if (!canView('frete')) return <NoAccessState />;
  const tables = query.data?.data ?? [];
  const hasDefault = tables.some((table) => table.scopeType === 'default');
  return (
    <div className={s.page}>
      <PageHeader title="Frete por região" description="A taxa de entrega e a taxa de troca por faixa de distância. Vale para novos pedidos." action={canEdit('frete') && !hasDefault && query.data ? <Button onClick={() => setEditing('new-default')} data-testid={T('add-default')}>Criar tabela padrão</Button> : undefined} />
      {!canEdit('frete') ? <Banner tone="info">Você pode ver, mas não alterar. Peça a um super admin ou ao financeiro.</Banner> : null}
      {query.isPending ? (
        <SkeletonRows rows={3} height={140} label="Carregando as tabelas" />
      ) : query.isError && !query.data ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : tables.length === 0 ? (
        <EmptyState icon={MapTrifold} title="Nenhuma tabela de frete" text="Sem tabela, o checkout não calcula a entrega. Crie a tabela padrão primeiro." actionLabel={canEdit('frete') ? 'Criar tabela padrão' : undefined} onAction={canEdit('frete') ? () => setEditing('new-default') : undefined} testId={T('empty')} />
      ) : (
        <ul className={s.list} aria-label="Tabelas de frete">
          {tables.map((table) => (
            <li key={table.id} className={s.card} data-testid={T(`table-${table.id}`)}>
              <div className={s.row}>
                <span className="wb-text-title2">{scopeLabel(table)}</span>
                <span className={`wb-text-caption ${s.muted}`}>Versão {table.version} · desde {formatDateTime(table.effectiveFrom)}</span>
              </div>
              <ul className={s.tiers} aria-label="Faixas">
                {table.tiers.map((tier, index) => (
                  <li key={index} className="wb-text-body">
                    {km(tier.fromM)} a {km(tier.toM)} km · entrega {formatCents(tier.feeCents)} · troca {formatCents(tier.exchangeFeeCents)} · custo previsto {formatCents(tier.expectedCostCents)} · {tier.etaMinutes} min
                  </li>
                ))}
              </ul>
              {canEdit('frete') ? (
                <div className={s.actions}>
                  <Button variant="secondary" onClick={() => setEditing(table)} data-testid={T(`edit-${table.id}`)}>Editar faixas</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <TierEditor table={editing === 'new-default' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function TierEditor({ table, onClose }: { table: FeeTable | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const reauth = useReauth();
  const [drafts, setDrafts] = useState<Draft[]>(
    table ? table.tiers.map((tier) => ({ toKm: km(tier.toM), fee: reais(tier.feeCents), exchangeFee: reais(tier.exchangeFeeCents), cost: reais(tier.expectedCostCents), eta: String(tier.etaMinutes) })) : [{ toKm: '3', fee: '5,00', exchangeFee: '', cost: '4,00', eta: '40' }],
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (index: number, patch: Partial<Draft>) => setDrafts((list) => list.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));

  async function save() {
    const built = buildTiers(drafts);
    if ('error' in built) {
      setError(built.error);
      return;
    }
    if (reason.trim().length < 3) {
      setError('Escreva o motivo da mudança.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reauth.guard(() => adminFinanceApi.putFeeTable({ scopeType: table?.scopeType ?? 'default', scopeId: table?.scopeId ?? null, tiers: built.tiers, reason: reason.trim(), expectedVersion: table?.version ?? 0 }), 'Mudar o frete altera o preço que o cliente paga. Confirme com o código do app autenticador.');
      toast.show('Tabela salva. Vale para novos pedidos.');
      void client.invalidateQueries({ queryKey: financeAdminKeys.fees });
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'FEE_TABLE_CONFLICT') setError('Outra pessoa alterou esta tabela antes de você. Feche e abra de novo para ver a versão atual.');
      else if (caught instanceof ApiError && caught.status === 422 && caught.detail) setError(caught.detail);
      else if (caught instanceof ApiError && caught.isNetwork) setError('Conecte-se para salvar. O que você digitou continua aqui.');
      else setError('Não foi possível salvar. Nada foi alterado.');
      setBusy(false);
    }
  }

  return (
    <Dialog wide title={table ? `Editar faixas: ${scopeLabel(table)}` : 'Tabela padrão de frete'} onClose={onClose} locked={busy} testId={T('editor')} actions={<><Button size="lg" onClick={() => void save()} loading={busy} loadingLabel="Salvando…" data-testid={T('save')}>Salvar nova versão</Button><Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <p className="wb-text-body" style={{ margin: 0 }}>As faixas começam em 0 km e seguem sem buracos. Troca em branco = metade da entrega.</p>
      <ul className={s.tiers}>
        {drafts.map((draft, index) => (
          <li key={index} className={s.tier} data-testid={T(`tier-${index}`)}>
            <TextField label={`Até (km)`} inputMode="decimal" value={draft.toKm} onChange={(event) => update(index, { toKm: event.target.value })} data-testid={T(`tier-${index}-to`)} />
            <TextField label="Entrega (R$)" inputMode="decimal" value={draft.fee} onChange={(event) => update(index, { fee: event.target.value })} data-testid={T(`tier-${index}-fee`)} />
            <TextField label="Troca (R$)" inputMode="decimal" value={draft.exchangeFee} onChange={(event) => update(index, { exchangeFee: event.target.value })} data-testid={T(`tier-${index}-exchange`)} />
            <TextField label="Custo previsto (R$)" inputMode="decimal" value={draft.cost} onChange={(event) => update(index, { cost: event.target.value })} />
            <TextField label="Prazo (min)" inputMode="numeric" value={draft.eta} onChange={(event) => update(index, { eta: event.target.value })} />
            {drafts.length > 1 ? <Button variant="text" onClick={() => setDrafts((list) => list.filter((_, i) => i !== index))} aria-label={`Remover faixa ${index + 1}`}>Remover</Button> : null}
          </li>
        ))}
      </ul>
      {drafts.length < MAX_TIERS ? <Button variant="secondary" onClick={() => setDrafts((list) => [...list, { toKm: '', fee: '', exchangeFee: '', cost: '', eta: '' }])} data-testid={T('add-tier')}>Adicionar faixa</Button> : null}
      <TextArea label="Motivo da mudança" value={reason} onChange={(event) => setReason(event.target.value.slice(0, 300))} rows={2} data-testid={T('reason')} />
      {error ? <Banner tone="danger" testId={T('error')}>{error}</Banner> : null}
    </Dialog>
  );
}
