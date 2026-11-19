'use client';

import { ArrowLeft } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, Button, ErrorState, SkeletonRows, TextArea, TextField, cx } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { ApiError } from '@/lib/api/errors';
import { EXCHANGE_STATUS_LABEL, EXCHANGE_TYPE_LABEL, exchangesApi, exchangesKeys, type Exchange } from '@/lib/api/exchanges';
import { formatCents, formatFullDateTime } from '@/lib/format';
import { attributesText } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { useExchangeActions } from './exchanges-page';
import s from './exchanges.module.css';

const T = (id: string) => ltid('trocas', id);

/** TL2: o que é da loja (conferir o item) e o que não é (coleta e entrega, da Webag). */
export function ExchangeDetailPage({ id }: { id: string }) {
  const { store } = useMerchant();
  const storeId = store.data?.id ?? '';
  const online = useOnline();
  const query = useQuery({ queryKey: exchangesKeys.detail(storeId, id), queryFn: () => exchangesApi.get(storeId, id), enabled: Boolean(storeId), refetchInterval: 30_000 });
  return (
    <div className={s.page}>
      <Link href={asRoute('/lojista/trocas')} className={s.back} data-testid={T('back')}>
        <ArrowLeft size={24} aria-hidden="true" />
        Trocas
      </Link>
      {query.data ? (
        <Body exchange={query.data} storeId={storeId} online={online} />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? <p className="wb-text-body" role="alert">Não encontramos essa troca.</p> : <ErrorState offline={!online} onRetry={() => void query.refetch()} />
      ) : (
        <SkeletonRows rows={3} height={120} label="Carregando a troca" />
      )}
    </div>
  );
}

function Body({ exchange, storeId, online }: { exchange: Exchange; storeId: string; online: boolean }) {
  const actions = useExchangeActions(storeId);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const busy = actions.isBusy(exchange.id);
  const atStore = exchange.method === 'drop_at_store';
  const canReceive = exchange.status === 'approved' || exchange.status === 'item_received';
  const item = exchange.item;

  async function receiveOk() {
    setError(null);
    if (atStore && !/^\d{6}$/.test(code)) {
      setCodeError('Digite os 6 dígitos do código da troca.');
      return;
    }
    setCodeError(undefined);
    setError(await actions.receive(exchange, atStore ? { ok: true, code } : { ok: true }));
  }

  async function receiveRefuse() {
    setError(null);
    if (reason.trim().length < 3) {
      setReasonError('Escreva o motivo (mínimo 3 caracteres).');
      return;
    }
    setReasonError(undefined);
    const result = await actions.receive(exchange, { ok: false, reason: reason.trim() });
    if (result) setError(result);
    else setRejecting(false);
  }

  return (
    <>
      <PageHeader title={`Troca ${exchange.number}`} description={`${EXCHANGE_TYPE_LABEL[exchange.type]} · pedido ${exchange.orderNumber} · ${EXCHANGE_STATUS_LABEL[exchange.status]}`} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {!online ? <Banner tone="warning" offline>Conecte-se para atualizar a troca. Nada foi alterado.</Banner> : null}
      <section className={s.block} aria-labelledby="ex-item">
        <h2 id="ex-item" className="wb-text-title2">Item</h2>
        <p className="wb-text-body-strong" style={{ margin: 0 }}>{item?.name ?? 'Item do pedido'} · {exchange.quantity}x</p>
        {item ? <p className="wb-text-body" style={{ margin: 0 }}>{attributesText(item.attributes ?? {})}{exchange.newVariant ? ` para ${attributesText(exchange.newVariant.attributes ?? {})}` : ''}</p> : null}
        {exchange.description ? <p className="wb-text-body" style={{ margin: 0 }}>{exchange.description}</p> : null}
        <p className="wb-text-caption" style={{ margin: 0 }}>Reembolso previsto: {formatCents(exchange.refund.amount)}. A taxa de coleta é da Webag e não entra no seu financeiro.</p>
      </section>

      {exchange.method === 'pickup_at_home' && canReceive ? <Banner tone="info" testId={T('webag-pickup-banner')}>A Webag busca a peça com o cliente. Avisamos quando ela chegar à loja.</Banner> : null}
      {exchange.status === 'in_mediation' ? <Banner tone="info">A Webag está decidindo. Resposta em até 5 dias úteis.</Banner> : null}

      {canReceive ? (
        <section className={s.block} aria-labelledby="ex-next" data-testid={T('next-step')}>
          <h2 id="ex-next" className="wb-text-title2">Conferir o item</h2>
          {atStore ? <TextField label="Código da troca" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} error={codeError} data-testid={T('pickup-code-input')} /> : null}
          {rejecting ? (
            <>
              <TextArea label="Motivo da reprovação" value={reason} onChange={(event) => setReason(event.target.value.slice(0, 200))} counter={{ value: reason.length, max: 200 }} rows={3} error={reasonError} data-testid={T('inspect-reject-reason')} />
              <p className="wb-text-caption" style={{ margin: 0 }}>Reprovar leva o caso à mediação da Webag. Você não recusa sozinho depois de receber.</p>
              <div className={s.actions}>
                <Button size="lg" variant="destructive" onClick={() => void receiveRefuse()} loading={busy} loadingLabel="Enviando…" disabled={!online}>Reprovar item</Button>
                <Button size="lg" variant="secondary" onClick={() => setRejecting(false)} disabled={busy}>Voltar</Button>
              </div>
            </>
          ) : (
            <div className={cx(s.actions)}>
              <Button size="lg" onClick={() => void receiveOk()} loading={busy} loadingLabel="Salvando…" disabled={!online} data-testid={T(atStore ? 'received' : 'inspect-ok')}>
                {atStore ? 'Marcar item recebido' : 'Item conferido, está OK'}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setRejecting(true)} disabled={busy || !online} data-testid={T('inspect-reject')}>
                Reprovar item
              </Button>
            </div>
          )}
        </section>
      ) : null}

      <section className={s.block} aria-labelledby="ex-tl" data-testid={T('timeline')}>
        <h2 id="ex-tl" className="wb-text-title2">Andamento</h2>
        <ol className={s.timeline}>
          {(exchange.timeline ?? []).map((entry, index) => (
            <li key={index} className="wb-text-body">
              <span className="wb-text-caption-strong">{formatFullDateTime(entry.at ?? exchange.createdAt)}</span> · {EXCHANGE_STATUS_LABEL[entry.to as Exchange['status']] ?? entry.to}
              {entry.actor === 'system' ? ' (Sistema)' : ''}
              {entry.reason ? ` · ${entry.reason}` : ''}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
