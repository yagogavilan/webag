'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useReauth } from '@/components/panel/reauth';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, ErrorState, NoAccessState, SelectField, SkeletonRows, Tabs, TextField, useToast } from '@/components/ui';
import { adminFinanceApi, financeAdminKeys, type CommissionRate } from '@/lib/api/admin-finance';
import { adminApi, keys } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './admin-finance.module.css';

const T = (id: string) => tid('comissoes', id);
type Tab = 'default' | 'category' | 'store';

const pctText = (pct: number | null | undefined) => (pct === null || pct === undefined ? 'Sem regra própria' : `${String(pct).replace('.', ',')}%`);

/** Ordem de valer (RN-10): loja, depois categoria, depois o padrão. Pedido já pago não muda (snapshot). */
export function CommissionsPage() {
  const { canView } = useSession();
  const [tab, setTab] = useState<Tab>('default');
  if (!canView('comissoes')) return <NoAccessState />;
  return (
    <div className={s.page}>
      <PageHeader title="Comissões" description="Quanto o Webag retém de cada venda. Vale da data escolhida em diante; pedidos já pagos não mudam." />
      <Tabs
        label="Comissões"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'default', label: 'Padrão', testId: T('tab-default') },
          { id: 'category', label: 'Por categoria', testId: T('tab-category') },
          { id: 'store', label: 'Por loja', testId: T('tab-store') },
        ]}
      />
      {tab === 'default' ? <DefaultRate /> : <Scoped kind={tab} />}
    </div>
  );
}

function DefaultRate() {
  const parameters = useQuery({ queryKey: ['admin', 'parameters'], queryFn: adminApi.parameters });
  const param = parameters.data?.data.find((item) => item.key === 'comissao_padrao_pct');
  if (parameters.isPending) return <SkeletonRows rows={1} height={96} label="Carregando a comissão padrão" />;
  return (
    <section className={s.card} data-testid={T('default')}>
      <h2 className="wb-text-title2" style={{ margin: 0 }}>Comissão padrão</h2>
      <p className="wb-text-title1" style={{ margin: 0 }}>{param ? `${String(param.value).replace('.', ',')}%` : 'Não carregou'}</p>
      <p className={`wb-text-caption ${s.muted}`}>Vale quando a loja e a categoria não têm regra própria. Para mudar, use Parâmetros (comissao_padrao_pct), com motivo e auditoria.</p>
    </section>
  );
}

function Scoped({ kind }: { kind: 'category' | 'store' }) {
  const online = useOnline();
  const [targetId, setTargetId] = useState('');
  const [storeInput, setStoreInput] = useState('');
  const categories = useQuery({ queryKey: keys.categories, queryFn: adminApi.categories, enabled: kind === 'category' });
  const id = kind === 'category' ? targetId : storeInput.trim();
  const valid = kind === 'category' ? id !== '' : /^[0-9a-f-]{36}$/i.test(id);
  const history = useQuery({
    queryKey: kind === 'category' ? financeAdminKeys.commissionCategory(id) : financeAdminKeys.commissionStore(id),
    queryFn: async () => (kind === 'category' ? adminFinanceApi.categoryCommission(id) : adminFinanceApi.storeCommission(id)),
    enabled: valid,
  });
  const data = history.data as { effective?: { pct: number; source: string }; history: CommissionRate[] } | undefined;
  const flat = (categories.data?.data ?? []).flatMap((node) => [node, ...(node.children ?? [])]);
  return (
    <div className={s.page}>
      {kind === 'category' ? (
        <SelectField label="Categoria" value={targetId} onChange={(event) => setTargetId(event.target.value)} data-testid={T('category-select')}>
          <option value="">Escolha uma categoria</option>
          {flat.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </SelectField>
      ) : (
        <TextField label="Código da loja" hint="Cole o código da loja (abra a loja em Lojas e copie o final do endereço)." value={storeInput} onChange={(event) => setStoreInput(event.target.value)} data-testid={T('store-input')} />
      )}
      {!valid ? null : history.isPending ? (
        <SkeletonRows rows={2} height={72} label="Carregando a comissão" />
      ) : history.isError ? (
        history.error instanceof ApiError && history.error.status === 404 ? <Banner tone="warning">Não encontramos essa loja.</Banner> : <ErrorState offline={!online} onRetry={() => void history.refetch()} />
      ) : (
        <Rates kind={kind} id={id} effective={data?.effective} history={data?.history ?? []} />
      )}
    </div>
  );
}

function Rates({ kind, id, effective, history }: { kind: 'category' | 'store'; id: string; effective: { pct: number; source: string } | undefined; history: CommissionRate[] }) {
  const { canEdit } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const reauth = useReauth();
  const [pct, setPct] = useState('');
  const [pctError, setPctError] = useState<string | undefined>();
  const [asking, setAsking] = useState<{ value: number | null } | null>(null);
  const key = kind === 'category' ? financeAdminKeys.commissionCategory(id) : financeAdminKeys.commissionStore(id);

  function ask(remove: boolean) {
    if (remove) return setAsking({ value: null });
    const value = Number(pct.replace(',', '.'));
    if (pct.trim() === '' || !Number.isFinite(value) || value < 0 || value > 30) {
      setPctError('Informe de 0 a 30, com até 2 casas.');
      return;
    }
    setPctError(undefined);
    setAsking({ value: Math.round(value * 100) / 100 });
  }

  return (
    <>
      {effective ? <p className="wb-text-body" data-testid={T('effective')}>Vale agora: <strong>{pctText(effective.pct)}</strong> ({effective.source === 'store' ? 'regra da loja' : effective.source === 'category' ? 'regra da categoria' : 'padrão'})</p> : null}
      {canEdit('comissoes') ? (
        <div className={s.card}>
          <TextField label="Nova comissão (%)" inputMode="decimal" value={pct} onChange={(event) => setPct(event.target.value)} error={pctError} data-testid={T('pct-input')} />
          <div className={s.actions}>
            <Button onClick={() => ask(false)} data-testid={T('save')}>Definir comissão</Button>
            <Button variant="secondary" onClick={() => ask(true)} data-testid={T('remove')}>Remover regra própria</Button>
          </div>
        </div>
      ) : null}
      <h2 className="wb-text-title2" style={{ margin: 0 }}>Histórico</h2>
      {history.length === 0 ? <p className="wb-text-body">Sem registros.</p> : (
        <ul className={s.list} data-testid={T('history')}>
          {history.map((rate) => (
            <li key={rate.id} className={s.card}>
              <span className="wb-text-body-strong">{pctText(rate.pct)} · desde {formatDateTime(rate.startsAt)}</span>
              <span className={`wb-text-caption ${s.muted}`}>{rate.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {asking ? (
        <ReasonDialog
          title={asking.value === null ? 'Remover a regra própria?' : `Definir comissão de ${pctText(asking.value)}?`}
          description="Vale para pedidos novos. Pedidos já pagos não mudam."
          minReason={3}
          confirmLabel={asking.value === null ? 'Remover regra' : 'Definir comissão'}
          onConfirm={async (reason) => {
            const body = { pct: asking.value, reason };
            try {
              await reauth.guard(() => (kind === 'category' ? adminFinanceApi.setCategoryCommission(id, body) : adminFinanceApi.setStoreCommission(id, body)), 'Mudar a comissão altera quanto a Webag ganha. Confirme com o código do app autenticador.');
            } catch (caught) {
              throw caught instanceof ApiError && caught.status === 422 && caught.detail ? new UserMessageError(caught.detail) : caught;
            }
            toast.show('Comissão salva. Registrada na auditoria.');
            void client.invalidateQueries({ queryKey: key });
          }}
          onClose={() => setAsking(null)}
          testIds={{ dialog: T('dialog'), reason: T('reason'), confirm: T('confirm') }}
        />
      ) : null}
    </>
  );
}
