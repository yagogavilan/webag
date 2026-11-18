'use client';

import { CheckCircle, Circle, Hourglass, XCircle } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, Button, ButtonLink, QueryBoundary, SkeletonRows, cx, ui, useToast } from '@/components/ui';
import { merchantApi, type MerchantStore } from '@/lib/api/lojista';
import { formatClock, formatDateTime } from '@/lib/format';
import { NEW_PRODUCT_PATH, isOnboarding, isOwner, maskedDocument, onboardingPath, resumeStep, supportHref } from '@/lib/lojista-access';
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
      return <Approved store={store} />;
    case 'live':
      return <Live />;
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

function Live() {
  const [open, setOpen] = useState(true);
  return (
    <div className={ui.stack} data-testid={T('status-card')}>
      <PageHeader title="Início" />
      {open ? (
        <Banner tone="success" action={<Button variant="text" size="sm" onClick={() => setOpen(false)}>Dispensar</Button>}>
          Sua loja está no ar.
        </Banner>
      ) : null}
    </div>
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
