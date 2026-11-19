'use client';

import { CheckCircle, Circle, Hourglass, XCircle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Lima, LimaAction, NightBlock } from '@/components/panel/blocks';
import { Banner, Button, ButtonLink, QueryBoundary, SkeletonRows, SolarIcon, cx, ui, useToast } from '@/components/ui';
import { useNow } from '@/lib/use-now';
import { useOptionalOrdersRuntime } from '@/features/orders/orders-runtime';
import { exchangesApi, exchangesKeys } from '@/lib/api/exchanges';
import { financeApi, financeKeys, periodOf } from '@/lib/api/finance';
import { formatCents } from '@/lib/format';
import { ReviewsSummaryCard } from '@/features/reviews/reviews-summary';
import { pickImage } from '@/lib/catalog/helpers';
import f from '@/features/finance/finance.module.css';
import { merchantApi, type MerchantStore } from '@/lib/api/lojista';
import { formatClock, formatDateTime } from '@/lib/format';
import { NEW_PRODUCT_PATH, canReplyReviews, canSeeSalesValues, isOnboarding, isOwner, isStoreLive, maskedDocument, onboardingPath, resumeStep, supportHref } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import s from './lojista.module.css';
import { draftErrorMessage } from './onboarding/use-draft';
import { STORE_KEY, useMerchant } from './store-context';

const T = (id: string) => ltid('inicio', id);

/** L8: acompanhar a aprovação e o que falta para a loja ir ao ar. Depois que a loja está no ar, o painel (onda 5) ocupa o lugar. */
export function LojistaHome() {
  const router = useRouter();
  const toast = useToast();
  const { store: query } = useMerchant();
  const data = query.data;
  const last = useRef<MerchantStore['status'] | null>(null);

  // Cadastro ainda em andamento: vai direto à etapa em que parou (WB-051 C4).
  useEffect(() => {
    if (data !== undefined && isOnboarding(data) && (data === null || isOwner(data))) router.replace(onboardingPath(resumeStep(data)) as never);
  }, [data, router]);

  // Mudança de status enquanto o painel está aberto: toast (L8, Sucesso).
  useEffect(() => {
    const status = data?.status;
    if (!status) return;
    if (last.current && last.current !== status) {
      if (status === 'approved') toast.show('Sua loja foi aprovada.');
      if (status === 'correction_requested') toast.show('Precisamos de uma correção na sua loja.');
      if (status === 'rejected') toast.show('Sua loja não foi aprovada.');
    }
    last.current = status;
  }, [data?.status, toast]);

  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={4} height={64} label="Carregando o andamento" />}>
      {(store) => (store === null || isOnboarding(store) ? <SkeletonRows rows={2} height={64} label="Abrindo o seu cadastro" /> : <Status store={store} updatedAt={query.dataUpdatedAt} stale={query.isError} />)}
    </QueryBoundary>
  );
}

function Status({ store, updatedAt, stale }: { store: MerchantStore; updatedAt: number; stale: boolean }) {
  const owner = isOwner(store);
  return (
    <>
      <div className={s.homeGrid}>
        <div className={ui.stack}>
          <StatusBody store={store} />
          {stale ? (
            <p className={cx('wb-text-caption', ui.muted)} role="status" data-testid={T('updated-at')} style={{ margin: 0 }}>
              Atualizado às {formatClock(new Date(updatedAt))}
            </p>
          ) : null}
        </div>
        {owner ? <Summary store={store} /> : null}
      </div>
    </>
  );
}

function StatusBody({ store }: { store: MerchantStore }) {
  switch (store.status) {
    case 'in_review':
      return <InReview store={store} />;
    case 'correction_requested':
      return <Corrections store={store} />;
    case 'rejected':
      return (
        <div className={ui.stack} data-testid={T('status-card')}>
          <PageHeader title="Sua loja não foi aprovada." />
          <XCircle size={64} weight="duotone" color="var(--wb-color-feedback-danger-border)" aria-hidden="true" />
          {store.decisionReason ? <p className="wb-text-body" style={{ margin: 0 }}>{store.decisionReason}</p> : null}
          <ButtonLink href={supportHref() as never} target="_blank" rel="noopener noreferrer" data-testid={T('support-link')}>
            Falar com o suporte
          </ButtonLink>
        </div>
      );
    case 'suspended':
      return (
        <div className={ui.stack} data-testid={T('status-card')}>
          <PageHeader title="Início" />
          <Banner tone="danger">
            <strong>Sua loja foi suspensa.</strong> {store.decisionReason ?? ''}
          </Banner>
          <ButtonLink href={supportHref() as never} target="_blank" rel="noopener noreferrer" data-testid={T('support-link')}>
            Falar com o suporte
          </ButtonLink>
        </div>
      );
    case 'approved':
      return isStoreLive(store) ? <Live store={store} /> : <Approved store={store} />;
    case 'live':
      return <Live store={store} />;
    default:
      return null;
  }
}

const STEPS = ['Enviada', 'Em análise', 'Resposta'] as const;

function InReview({ store }: { store: MerchantStore }) {
  return (
    <div className={ui.stack} data-testid={T('status-card')}>
      <PageHeader title="Sua loja está em análise" />
      <ol className={s.timeline} aria-label="Andamento da análise">
        {STEPS.map((label, index) => {
          const state = index === 0 ? 'done' : index === 1 ? 'now' : 'todo';
          return (
            <li key={label} className={cx(s.timelineItem, state === 'done' && s.timelineDone, state === 'now' && s.timelineNow)} aria-current={state === 'now' ? 'step' : undefined}>
              {state === 'done' ? <CheckCircle size={24} weight="fill" aria-hidden="true" /> : state === 'now' ? <Hourglass size={24} weight="fill" aria-hidden="true" /> : <Circle size={24} aria-hidden="true" />}
              <span className="wb-text-body">{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="wb-text-body" style={{ margin: 0 }}>
        Respondemos em até {store.slaBusinessDays} dias úteis.
      </p>
      {store.submittedAt ? (
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>
          Enviado em {formatDateTime(store.submittedAt).replace(' de ', ' ')}.
        </p>
      ) : null}
    </div>
  );
}

function Corrections({ store }: { store: MerchantStore }) {
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  async function resubmit() {
    setError(null);
    const first = store.corrections.find((c) => !c.fixed);
    if (first) {
      setMissing(first.message);
      list.current?.querySelector<HTMLElement>(`[data-testid="${T(`correction-${first.id}`)}"]`)?.scrollIntoView({ block: 'center' });
      return;
    }
    setBusy(true);
    try {
      client.setQueryData<MerchantStore | null>(STORE_KEY, await merchantApi.submit(store.id));
      toast.show('Cadastro reenviado para análise.');
    } catch (caught) {
      setError(draftErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={ui.stack} data-testid={T('status-card')}>
      <PageHeader title="Início" />
      <Banner tone="warning">Precisamos de uma correção.</Banner>
      {store.corrections.length === 0 ? (
        <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('all-fixed')}>
          Tudo corrigido. Reenvie para análise.
        </p>
      ) : null}
      <ul ref={list} style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid={T('corrections-list')}>
        {store.corrections.map((item) => (
          <li key={item.id} className={s.correctionItem} data-testid={T(`correction-${item.id}`)}>
            <span className="wb-text-body">{item.message}</span>
            {item.fixed ? (
              <span className={cx('wb-text-caption', s.slotState, s.slotOk)}>
                <CheckCircle size={16} weight="fill" aria-hidden="true" /> Corrigido
              </span>
            ) : (
              <span>
                <Button variant="secondary" size="sm" onClick={() => router.push((item.target.type === 'document' ? '/lojista/correcao' : '/lojista/onboarding/2?correcao=1') as never)}>
                  Corrigir
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {missing ? (
        <p className="wb-text-body" role="alert" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }} data-testid={T('missing')}>
          Falta corrigir: {missing}
        </p>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button size="lg" loading={busy} loadingLabel="Enviando…" onClick={() => void resubmit()} data-testid={T('resubmit')}>
        Reenviar para análise
      </Button>
    </div>
  );
}

function Approved({ store }: { store: MerchantStore }) {
  const connected = store.payout.status === 'connected';
  const tasks = [
    { id: 'product', label: 'Cadastrar o primeiro produto', done: store.hasActiveProduct, href: NEW_PRODUCT_PATH },
    { id: 'hours', label: 'Definir horário', done: store.hasHours, href: null },
    { id: 'sound', label: 'Testar o som dos pedidos', done: false, href: null },
  ];
  const done = tasks.filter((task) => task.done).length;
  const checks = [
    { label: 'Loja aprovada', ok: true },
    { label: store.hasActiveProduct ? 'Produto cadastrado' : 'Cadastre 1 produto', ok: store.hasActiveProduct },
    { label: connected ? 'Mercado Pago conectado' : 'Conecte o Mercado Pago', ok: connected },
  ];
  return (
    <div className={ui.stack} data-testid={T('status-card')}>
      <PageHeader title="Sua loja foi aprovada." />
      <Banner tone="info">
        <strong>Falta pouco para aparecer no app</strong>
        <ul className={s.checks} style={{ marginTop: 8 }}>
          {checks.map((check) => (
            <li key={check.label} className={s.task}>
              {check.ok ? <CheckCircle size={20} weight="fill" aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
              <span>{check.label}{check.ok ? ' (feito)' : ''}</span>
            </li>
          ))}
        </ul>
      </Banner>
      {!store.hasActiveProduct ? (
        <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('no-product')}>
          Cadastre 1 produto para aparecer no app.
        </p>
      ) : null}
      <h2 className="wb-text-title2" style={{ margin: 0 }}>
        Primeiros passos · {done} de {tasks.length}
      </h2>
      <ul className={s.tasks}>
        {tasks.map((task) => (
          <li key={task.id} className={s.task} data-testid={T(`task-${task.id}`)}>
            {task.done ? <CheckCircle size={24} weight="fill" aria-hidden="true" /> : <Circle size={24} aria-hidden="true" />}
            {task.href && !task.done ? (
              <a href={task.href} className="wb-text-body-strong">{task.label}</a>
            ) : (
              <span className="wb-text-body">{task.label}{!task.done && !task.href ? ' (em breve)' : ''}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });
const hourOfDay = new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' });

/** "Bom dia, Fátima" (primeiro nome de quem está no painel). */
function greeting(name: string, at: Date): string {
  const hour = Number(hourOfDay.format(at));
  const first = name.trim().split(/\s+/)[0] ?? '';
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return first ? `${hello}, ${first}` : hello;
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function Live({ store }: { store: MerchantStore }) {
  const { user } = useMerchant();
  const now = useNow(1000);
  const pending = useOptionalOrdersRuntime()?.pending ?? [];
  const showValues = canSeeSalesValues(store);
  const todos: { id: string; icon: ReactNode; label: string; href: string; urgent?: boolean }[] = [];
  if (!store.hasHours) todos.push({ id: 'hours', icon: <SolarIcon name="clock" size={24} />, label: 'Sem horário definido', href: '/lojista/loja/horarios' });
  if (store.payout.status !== 'connected' && isOwner(store)) todos.push({ id: 'payout', icon: <SolarIcon name="wallet" size={24} />, label: 'Falta conectar o Mercado Pago', href: '/lojista/onboarding/4' });
  const exchanges = useExchangeTodo(store.id);
  if (exchanges) todos.push(exchanges);

  const deadlines = pending.map((order) => (order.acceptDeadlineAt ? Date.parse(order.acceptDeadlineAt) : null)).filter((value): value is number => value !== null);
  const urgent = deadlines.length > 0 ? Math.min(...deadlines) - now : null;

  return (
    <div className={cx(ui.stack, 'wb-enter')} data-testid={T('status-card')}>
      <PageHeader title={greeting(user.name, new Date(now))} eyebrow={dateLabel.format(new Date(now)).replace(/^./, (c) => c.toUpperCase())} />
      <div className={f.openRow} data-testid={T('hero')}>
        <span className={f.openIcon}><SolarIcon name="store" size={26} /></span>
        <span className={f.openText}>
          <span className="wb-text-body-strong">{store.status === 'live' ? 'Loja aberta' : 'Loja no ar'}</span>
          <span className={cx('wb-text-caption', f.openHint)}>{pending.length > 0 ? 'Tem pedido esperando você.' : 'Mantenha o painel aberto para ouvir os pedidos.'}</span>
        </span>
        <Link href={'/lojista/loja' as never} className={f.openLink} data-testid="lojista.home.open">Pausar ou ajustar</Link>
      </div>
      {pending.length > 0 ? (
        <NightBlock icon="bell" title={`${pending.length} ${pending.length === 1 ? 'pedido novo' : 'pedidos novos'}`} testId="lojista.home.new-orders" role="status" action={<LimaAction href="/lojista/pedidos" testId={T('todo-orders')}>Ver pedidos</LimaAction>}>
          {urgent !== null ? (
            <>
              O mais urgente vence em <Lima>{mmss(urgent)}</Lima>. Sem resposta, o pedido é cancelado.
            </>
          ) : (
            'Responda agora para o cliente não esperar.'
          )}
        </NightBlock>
      ) : null}
      <section aria-labelledby="para-fazer">
        <h2 id="para-fazer" className="wb-text-title2" style={{ margin: '0 0 12px' }}>
          Para fazer agora
        </h2>
        {todos.length === 0 && pending.length === 0 ? (
          <Banner tone="success" testId={T('all-clear')}>
            Tudo em dia.
          </Banner>
        ) : (
          <ul className={f.todo} data-testid={T('todo-list')}>
            {todos.map((todo) => (
              <li key={todo.id}>
                <Link href={todo.href as never} className={cx(f.todoItem, todo.urgent && f.todoUrgent, 'wb-text-body-strong')} data-testid={T(`todo-${todo.id}`)}>
                  <span className={f.todoIcon}>{todo.icon}</span>
                  {todo.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {showValues ? <SalesKpis storeId={store.id} /> : null}
      {showValues ? <TopProducts storeId={store.id} /> : null}
      {canReplyReviews(store) ? <ReviewsSummaryCard storeId={store.id} variant="home" /> : null}
    </div>
  );
}

function useExchangeTodo(storeId: string): { id: string; icon: ReactNode; label: string; href: string; urgent?: boolean } | null {
  const query = useQuery({ queryKey: exchangesKeys.pending(storeId), queryFn: () => exchangesApi.list(storeId, { scope: 'pending', limit: 50 }), staleTime: 30_000, refetchInterval: 60_000 });
  const count = query.data?.data.length ?? 0;
  if (count === 0) return null;
  return { id: 'exchanges', icon: <SolarIcon name="exchange" size={24} />, label: `${count} ${count === 1 ? 'troca para responder' : 'trocas para responder'}`, href: '/lojista/trocas', urgent: true };
}

/** "Hoje" e "Últimos 7 dias": só com `vendas_valores` (o funcionário sem a permissão não vê dinheiro). Um bloco que falha não derruba o painel. */
function SalesKpis({ storeId }: { storeId: string }) {
  const today = periodOf('today');
  const week = periodOf('7d');
  const todayQ = useQuery({ queryKey: financeKeys.sales(storeId, today), queryFn: () => financeApi.sales(storeId, today), refetchInterval: 60_000 });
  const weekQ = useQuery({ queryKey: financeKeys.sales(storeId, week), queryFn: () => financeApi.sales(storeId, week), refetchInterval: 5 * 60_000 });
  if (todayQ.isPending || weekQ.isPending) return <SkeletonRows rows={1} height={110} label="Carregando as vendas" />;
  if (!todayQ.data || !weekQ.data) {
    return (
      <Banner tone="warning" action={<Button size="sm" variant="secondary" onClick={() => { void todayQ.refetch(); void weekQ.refetch(); }}>Tentar de novo</Button>} testId={T('sales-error')}>
        Não conseguimos carregar as vendas.
      </Banner>
    );
  }
  const money = (m: { amount?: number } | undefined) => formatCents(m?.amount ?? 0);
  return (
    <section aria-labelledby="vendas-hoje">
      <h2 id="vendas-hoje" className="wb-text-title2" style={{ margin: '0 0 12px' }}>
        Vendas
      </h2>
      <ul className={f.kpis}>
        <li className={f.kpi} data-testid={T('kpi-today')}>
          <p className={cx('wb-text-caption-strong', f.kpiLabel)}>Hoje</p>
          <p className={f.kpiValue}>{money(todayQ.data.gross)}</p>
          <p className={cx('wb-text-caption', f.kpiNote)}>{todayQ.data.orders} pedidos</p>
        </li>
        <li className={f.kpi} data-testid={T('kpi-week')}>
          <p className={cx('wb-text-caption-strong', f.kpiLabel)}>Últimos 7 dias</p>
          <p className={f.kpiValue}>{money(weekQ.data.gross)}</p>
          <p className={cx('wb-text-caption', f.kpiNote)}>{weekQ.data.orders} pedidos</p>
        </li>
        <li className={f.kpi} data-testid={T('kpi-ticket')}>
          <p className={cx('wb-text-caption-strong', f.kpiLabel)}>Ticket médio (7 dias)</p>
          <p className={f.kpiValue}>{money(weekQ.data.averageTicket)}</p>
        </li>
      </ul>
    </section>
  );
}

/**
 * "Mais vendidos da semana" (W.6): unidades e "você recebe" por produto (parte do líquido do pedido, antes da tarifa do provedor).
 * Só com `vendas_valores`. Sem vendas no período o bloco some; falha não derruba o painel.
 */
function TopProducts({ storeId }: { storeId: string }) {
  const week = periodOf('7d');
  const query = useQuery({ queryKey: financeKeys.topProducts(storeId, week), queryFn: () => financeApi.topProducts(storeId, week, 5), refetchInterval: 5 * 60_000, retry: 1 });
  const rows = query.data?.data ?? [];
  if (query.isPending || rows.length === 0) return null;
  return (
    <section aria-labelledby="mais-vendidos" data-testid={T('top-products')}>
      <h2 id="mais-vendidos" className="wb-text-title2" style={{ margin: '0 0 12px' }}>Mais vendidos da semana</h2>
      <ol className={s.ranking}>
        {rows.map((row, index) => {
          const url = pickImage(row.image.urls, 160);
          return (
            <li key={row.productId} className={s.rankRow} data-testid={T(`top-${row.productId}`)}>
              <span className={s.rankNumber} aria-hidden="true">{index + 1}</span>
              <span className={s.rankThumb}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem pública já redimensionada pelo servidor
                  <img src={url} alt="" width={48} height={48} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : null}
              </span>
              <span className={s.rankText}>
                <span className="wb-text-body-strong">{row.name}</span>
                <span className={cx('wb-text-caption', ui.muted)}>{row.units} {row.units === 1 ? 'unidade' : 'unidades'}</span>
              </span>
              <span className={s.rankGet}>
                <span className={cx('wb-text-caption', ui.muted)}>Você recebe</span>
                <span className="wb-text-body-strong">{formatCents(row.youReceive.amount)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Resumo somente leitura do cadastro (desktop, coluna da direita). O funcionário não vê (L8, Permissão). */
function Summary({ store }: { store: MerchantStore }) {
  return (
    <aside className={ui.card} aria-labelledby="resumo-cadastro" data-testid={T('summary')}>
      <div className={ui.stack}>
        <h2 id="resumo-cadastro" className="wb-text-title2" style={{ margin: 0 }}>
          Resumo do cadastro
        </h2>
        <dl className={s.reviewList}>
          <dt className="wb-text-caption">Loja</dt>
          <dd className="wb-text-body">{store.name}</dd>
          <dt className="wb-text-caption">{store.legalType === 'cnpj' ? 'CNPJ' : 'CPF'}</dt>
          <dd className="wb-text-body">{maskedDocument(store.document)}</dd>
          <dt className="wb-text-caption">Cidade</dt>
          <dd className="wb-text-body">{store.address ? `${store.address.city} - ${store.address.state}` : ''}</dd>
          <dt className="wb-text-caption">Documentos</dt>
          <dd className="wb-text-body">{store.documents.length} enviados</dd>
        </dl>
      </div>
    </aside>
  );
}
