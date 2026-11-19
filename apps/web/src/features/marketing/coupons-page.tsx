'use client';

import { CheckCircle, Clock, Prohibit, Ticket, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, CheckboxField, Dialog, EmptyState, NoAccessState, QueryBoundary, SelectField, Switch, TextField, cx, ui, useToast } from '@/components/ui';
import k from '@/components/panel/kit.module.css';
import { marketingApi, marketingKeys, type PlatformCoupon, type PlatformCouponCreate, type PlatformCouponDetail } from '@/lib/api/admin-marketing';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatCents, formatDateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { centsInput, parseCents } from '@/lib/money';
import { tid } from '@/lib/testid';

const T = (id: string) => tid('cupons', id);
const KIND_LABEL: Record<PlatformCoupon['kind'], string> = { percent: 'Percentual', fixed: 'Valor fixo', free_shipping: 'Frete grátis' };
const STATUS: Record<PlatformCoupon['status'], { label: string; tone: 'success' | 'info' | 'neutral' | 'warning'; Icon: typeof Clock }> = {
  scheduled: { label: 'Agendado', tone: 'info', Icon: Clock },
  live: { label: 'No ar', tone: 'success', Icon: CheckCircle },
  paused: { label: 'Pausado', tone: 'neutral', Icon: Prohibit },
  ended: { label: 'Encerrado', tone: 'neutral', Icon: Prohibit },
  exhausted: { label: 'Esgotado', tone: 'warning', Icon: WarningCircle },
};

export function discountText(c: Pick<PlatformCoupon, 'kind' | 'value' | 'percentCapCents'>): string {
  if (c.kind === 'free_shipping') return 'Frete grátis';
  if (c.kind === 'fixed') return `${formatCents(c.value)} de desconto`;
  return `${c.value}% de desconto${c.percentCapCents ? `, até ${formatCents(c.percentCapCents)}` : ''}`;
}

/** DT-059: custo máximo da campanha = limite de usos x desconto máximo por uso; sem desconto máximo por uso não há como calcular. */
export function maxCostText(c: Pick<PlatformCoupon, 'maxUses' | 'maxCost'>): string {
  if (!c.maxUses) return 'Sem teto';
  return c.maxCost ? `até ${formatCents(c.maxCost.amount)}` : 'Sem teto por uso (percentual sem desconto máximo ou frete grátis)';
}

/** WB-116 C5: usos por loja do cupom, para o admin perceber autoconsumo (loja usando o próprio cupom). */
function UsageDialog({ coupon, onClose }: { coupon: PlatformCoupon; onClose: () => void }) {
  const query = useQuery({ queryKey: marketingKeys.coupon(coupon.id), queryFn: () => marketingApi.couponDetail(coupon.id) });
  return (
    <Dialog title={`Uso de ${coupon.code} por loja`} wide onClose={onClose} testId={T('usage')} actions={<Button variant="text" onClick={onClose}>Fechar</Button>}>
      <QueryBoundary query={query} skeletonLabel="Carregando uso por loja" empty={(d: PlatformCouponDetail) => (d.usesByStore.length === 0 ? <p className="wb-text-body" data-testid={T('usage-empty')}>Nenhuma loja usou este cupom ainda.</p> : null)}>
        {(d: PlatformCouponDetail) => (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="wb-text-caption">Usos que não foram devolvidos, até 100 lojas. Uma loja com participação muito alta pode ser autoconsumo.</caption>
              <thead><tr><th>Loja</th><th>Usos</th><th>Desconto pago</th><th>Participação</th></tr></thead>
              <tbody>
                {d.usesByStore.map((s) => (
                  <tr key={s.storeId} data-testid={T(`usage-${s.storeId}`)}>
                    <td data-primary><span className="wb-text-body-strong">{s.storeName ?? 'Loja sem nome'}</span></td>
                    <td data-label="Usos" className={ui.mono}>{s.uses}</td>
                    <td data-label="Desconto pago" className={ui.mono}>{formatCents(s.discount.amount)}</td>
                    <td data-label="Participação" className={ui.mono}>{s.sharePct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={cx('wb-text-caption', k.muted)}>Teto de custo da campanha: {maxCostText(d)}.</p>
          </div>
        )}
      </QueryBoundary>
    </Dialog>
  );
}

/** WB-116: cupons da plataforma. O custo é da Webag (aviso da API); financeiro só lê. */
export function CouponsPage() {
  const { canView, canEdit } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: marketingKeys.coupons, queryFn: () => marketingApi.coupons(), enabled: canView('cupons') });
  const [editing, setEditing] = useState<PlatformCoupon | 'new' | null>(null);
  const [viewing, setViewing] = useState<PlatformCoupon | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const patch = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => marketingApi.updateCoupon(id, { active }), onSuccess: () => client.invalidateQueries({ queryKey: marketingKeys.coupons }) });
  if (!canView('cupons')) return <NoAccessState />;
  const editable = canEdit('cupons');
  return (
    <div className={k.page}>
      <PageHeader title="Cupons da plataforma" description="O desconto é pago pelo Webag, não pela loja. Acompanhe o uso e o custo." action={editable ? <Button onClick={() => setEditing('new')} data-testid={T('new')}>Novo cupom</Button> : null} />
      {rowError ? <Banner tone="danger">{rowError}</Banner> : null}
      <QueryBoundary query={query} skeletonLabel="Carregando cupons" empty={(d) => (d.data.length === 0 ? <EmptyState icon={Ticket} title="Nenhum cupom" text="Crie um cupom para campanhas e banners." actionLabel={editable ? 'Novo cupom' : undefined} onAction={() => setEditing('new')} testId={T('empty')} /> : null)}>
        {(data) => (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="wb-text-caption">Cupons e o que já custaram</caption>
              <thead><tr><th>Código</th><th>Desconto</th><th>Período</th><th>Uso</th><th>Custo</th><th>Teto de custo</th><th>Status</th>{editable ? <th>Ativo</th> : null}<th>Ações</th></tr></thead>
              <tbody>
                {data.data.map((c) => {
                  const { label, tone, Icon } = STATUS[c.status];
                  return (
                    <tr key={c.id} data-testid={T(`row-${c.id}`)}>
                      <td data-primary><span className="wb-text-body-strong">{c.code}</span></td>
                      <td data-label="Desconto">{discountText(c)}{c.minOrderCents > 0 ? `, pedido a partir de ${formatCents(c.minOrderCents)}` : ''}</td>
                      <td data-label="Período">{formatDateTime(c.startsAt)} a {formatDateTime(c.endsAt)}</td>
                      <td data-label="Uso" className={ui.mono}>{c.uses}{c.maxUses ? ` de ${c.maxUses}` : ''} usos em {c.orders} pedidos{c.maxUses ? null : <><br /><span className={k.muted}>Sem limite de usos (cupom antigo)</span></>}</td>
                      <td data-label="Custo" className={ui.mono}>{formatCents(c.discountTotal.amount)}</td>
                      <td data-label="Teto de custo" className={ui.mono} data-testid={T(`row-${c.id}-maxcost`)}>{maxCostText(c)}</td>
                      <td data-label="Status"><Badge tone={tone} icon={<Icon size={16} weight="fill" aria-hidden="true" />}>{label}</Badge></td>
                      {editable ? <td data-label="Ativo"><Switch checked={c.active} onChange={() => void patch.mutateAsync({ id: c.id, active: !c.active }).then(() => toast.show(c.active ? 'Cupom pausado.' : 'Cupom ativado.'), (e) => setRowError(saveErrorMessage(e)))} label={`Cupom ${c.code}`} onText="Ativo" offText="Pausado" testId={T(`row-${c.id}-switch`)} /></td> : null}
                      <td><Button variant="text" size="sm" onClick={() => setViewing(c)} data-testid={T(`row-${c.id}-usage`)}>Ver uso por loja</Button>{editable ? <Button variant="text" size="sm" onClick={() => setEditing(c)} data-testid={T(`row-${c.id}-edit`)}>Editar</Button> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={cx('wb-text-caption', k.muted)}>{data.data[0]?.notice}</p>
          </div>
        )}
      </QueryBoundary>
      {viewing ? <UsageDialog coupon={viewing} onClose={() => setViewing(null)} /> : null}
      {editing ? <CouponForm coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CouponForm({ coupon, onClose }: { coupon: PlatformCoupon | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState(coupon?.code ?? '');
  const [kind, setKind] = useState<PlatformCoupon['kind']>(coupon?.kind ?? 'percent');
  const [value, setValue] = useState(coupon ? (coupon.kind === 'fixed' ? centsInput(coupon.value) : String(coupon.value)) : '');
  const [cap, setCap] = useState(coupon?.percentCapCents ? centsInput(coupon.percentCapCents) : '');
  const [min, setMin] = useState(coupon ? centsInput(coupon.minOrderCents) : '');
  const [startsAt, setStartsAt] = useState(coupon ? toLocalInput(coupon.startsAt) : '');
  const [endsAt, setEndsAt] = useState(coupon ? toLocalInput(coupon.endsAt) : '');
  const [maxUses, setMaxUses] = useState(coupon?.maxUses ? String(coupon.maxUses) : '');
  const [perCustomer, setPerCustomer] = useState(String(coupon?.perCustomerLimit ?? 1));
  const [first, setFirst] = useState(coupon?.firstPurchaseOnly ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next: Record<string, string> = {};
    if (!coupon && !/^[A-Z0-9]{4,20}$/.test(code)) next.code = 'Use de 4 a 20 letras ou números, sem espaço.';
    const percent = Number(value);
    const fixed = parseCents(value);
    if (kind === 'percent' && !(Number.isInteger(percent) && percent >= 1 && percent <= 100)) next.value = 'Digite o percentual de 1 a 100.';
    if (kind === 'fixed' && (fixed === null || fixed < 1)) next.value = 'Digite o valor do desconto.';
    const v = kind === 'percent' ? percent : (fixed ?? 0);
    const capCents = cap ? parseCents(cap) : null;
    if (cap && capCents === null) next.cap = 'Digite um valor.';
    const minCents = min ? parseCents(min) : 0;
    if (min && minCents === null) next.min = 'Digite um valor.';
    const s = fromLocalInput(startsAt);
    const e = fromLocalInput(endsAt);
    if (!s) next.startsAt = 'Informe quando começa.';
    if (!e) next.endsAt = 'Informe quando termina.';
    if (s && e && Date.parse(e) <= Date.parse(s)) next.endsAt = 'O fim precisa ser depois do início.';
    const uses = Number(maxUses);
    if (!maxUses) next.maxUses = 'Informe o limite de usos. Todo cupom da plataforma precisa de um teto.';
    else if (!(Number.isInteger(uses) && uses >= 1)) next.maxUses = 'Digite um número a partir de 1.';
    const per = Number(perCustomer);
    if (!(Number.isInteger(per) && per >= 1 && per <= 100)) next.perCustomer = 'Digite de 1 a 100.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      if (coupon) {
        await marketingApi.updateCoupon(coupon.id, { ...(kind !== 'free_shipping' ? { value: v } : {}), ...(kind === 'percent' ? { percentCapCents: capCents } : {}), minOrderCents: minCents ?? 0, endsAt: e!, maxUses: uses, perCustomerLimit: per, firstPurchaseOnly: first });
      } else {
        const body: PlatformCouponCreate = { code, kind, ...(kind !== 'free_shipping' ? { value: v } : {}), ...(kind === 'percent' && capCents ? { percentCapCents: capCents } : {}), minOrderCents: minCents ?? 0, startsAt: s!, endsAt: e!, maxUses: uses, perCustomerLimit: per, firstPurchaseOnly: first };
        await marketingApi.createCoupon(body);
      }
      await client.invalidateQueries({ queryKey: marketingKeys.coupons });
      toast.show(coupon ? 'Cupom salvo.' : 'Cupom criado.');
      onClose();
    } catch (error) {
      const status = (error as { status?: number }).status;
      setFormError(status === 409 ? 'Já existe um cupom com esse código.' : saveErrorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Dialog title={coupon ? `Editar ${coupon.code}` : 'Novo cupom'} wide onClose={onClose} locked={busy} testId={T('form')} actions={<><Button onClick={() => void save()} loading={busy} loadingLabel="Salvando…" data-testid={T('submit')}>{coupon ? 'Salvar cupom' : 'Criar cupom'}</Button><Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <div className={k.form}>
        {formError ? <Banner tone="danger" testId={T('form-error')}>{formError}</Banner> : null}
        <TextField label="Código" value={code} disabled={coupon !== null} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))} error={errors.code} data-testid={T('code-input')} />
        <SelectField label="Tipo" value={kind} disabled={coupon !== null} onChange={(e) => setKind(e.target.value as PlatformCoupon['kind'])} data-testid={T('kind-select')}>
          {(Object.keys(KIND_LABEL) as PlatformCoupon['kind'][]).map((key) => <option key={key} value={key}>{KIND_LABEL[key]}</option>)}
        </SelectField>
        {kind !== 'free_shipping' ? <TextField label={kind === 'percent' ? 'Percentual (1 a 100)' : 'Valor do desconto (R$)'} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} data-testid={T('value-input')} /> : null}
        {kind === 'percent' ? <TextField label="Desconto máximo (R$, opcional)" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} error={errors.cap} /> : null}
        <TextField label="Pedido mínimo (R$, opcional)" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} error={errors.min} />
        <div className={k.grid2}>
          <TextField label="Começa em" type="datetime-local" value={startsAt} disabled={coupon !== null} onChange={(e) => setStartsAt(e.target.value)} error={errors.startsAt} />
          <TextField label="Termina em" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={errors.endsAt} />
        </div>
        <div className={k.grid2}>
          <TextField label="Limite de usos" required hint="Obrigatório: é o teto de custo da campanha." inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} error={errors.maxUses} />
          <TextField label="Usos por cliente" inputMode="numeric" value={perCustomer} onChange={(e) => setPerCustomer(e.target.value.replace(/\D/g, ''))} error={errors.perCustomer} />
        </div>
        <CheckboxField label="Só na primeira compra" checked={first} onChange={(e) => setFirst(e.target.checked)} />
      </div>
    </Dialog>
  );
}
