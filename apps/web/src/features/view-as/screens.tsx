'use client';

import { CaretRight } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Badge, Button, cx } from '@/components/ui';
import { Thumb } from '@/features/catalog/product-row';
import { EXCHANGE_STATUS_LABEL, EXCHANGE_TYPE_LABEL } from '@/lib/api/exchanges';
import type { OrderStatus } from '@/lib/api/orders';
import { viewAsApi, viewAsKeys, type ExchangePageViewAs, type StoreSettingsViewAs, type StoreViewAs } from '@/lib/api/view-as';
import { formatCents, formatClock, formatDateTime } from '@/lib/format';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ViewAsBoundary, OnlyMerchantTag, type BoundaryQuery } from './boundary';
import { T } from './banner';
import s from './view-as.module.css';

interface ScreenProps {
  storeId: string;
  onExpired: () => void;
}

const POLL_MS = 30_000;
const STATUS_LABEL: Record<OrderStatus, string> = { ...ORDER_STATUS_LABEL, received: 'Pedido novo', out_for_delivery: 'Saiu para entrega' };

/** Linha de ajuda: diz o que falta na tela e por quê. Campo que não aparece NÃO ganha placeholder (spec 4.1). */
export function Help({ children }: { children: ReactNode }) {
  return <p className={cx('wb-text-body', s.help)} data-testid={T('help')}>{children}</p>;
}

function LoadMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  return query.hasNextPage ? (
    <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…">
      Carregar mais
    </Button>
  ) : null;
}

/** O que o lojista faria neste pedido: aparece como etiqueta, nunca como botão (C1). */
function blockedAction(status: OrderStatus): string | null {
  if (status === 'received') return 'Aceitar e recusar: só o lojista';
  if (status === 'accepted' || status === 'in_preparation') return 'Marcar como pronto: só o lojista';
  if (status === 'ready_for_collection' || status === 'out_for_delivery' || status === 'ready_for_pickup') return 'Marcar como entregue: só o lojista';
  return null;
}

function OrderDetail({ storeId, orderId, onExpired }: ScreenProps & { orderId: string }) {
  const query = useQuery({ queryKey: viewAsKeys.read(storeId, 'order', orderId), queryFn: () => viewAsApi.order(storeId, orderId), retry: false });
  return (
    <ViewAsBoundary query={query} onExpired={onExpired} empty={{ title: '', text: '' }}>
      {(order) => (
        <div className={s.stack} data-testid={T('order-detail')}>
          <p className="wb-text-caption" style={{ margin: 0 }}>
            {order.mode === 'pickup' ? 'Retirada na loja' : `Bairro: ${order.delivery?.neighborhood ?? ''}`}
          </p>
          <ul className={s.list} aria-label="Itens do pedido">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="wb-text-caption">
                {item.quantity}x {item.name}
                {Object.values(item.attributes).length > 0 ? ` (${Object.values(item.attributes).join(', ')})` : ''}
                {item.lineTotal ? <span className={s.tnum}> · {formatCents(item.lineTotal.amount)}</span> : null}
              </li>
            ))}
          </ul>
          <ol className={s.list} aria-label="Linha do tempo">
            {order.timeline.map((entry, index) => (
              <li key={`${entry.status}-${index}`} className="wb-text-caption">
                <span className={s.tnum}>{formatDateTime(entry.at)}</span> · {STATUS_LABEL[entry.status]}
              </li>
            ))}
          </ol>
        </div>
      )}
    </ViewAsBoundary>
  );
}

export function OrdersScreen({ storeId, onExpired }: ScreenProps) {
  const [open, setOpen] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: viewAsKeys.read(storeId, 'orders'),
    queryFn: ({ pageParam }) => viewAsApi.orders(storeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.data),
    refetchInterval: POLL_MS,
    retry: false,
  });
  return (
    <>
      <Help>Nome completo, contato, endereço e observações do cliente não aparecem nesta visualização. Para falar com o cliente, abra a ficha do pedido pelo número.</Help>
      <ViewAsBoundary query={query} onExpired={onExpired} isEmpty={(rows) => rows.length === 0} empty={{ title: 'Nenhum pedido nesta loja ainda', text: 'Quando a loja receber pedidos, eles aparecem aqui.' }}>
        {(rows) => (
          <>
            <ul className={s.list} data-testid={T('orders')}>
              {rows.map((order) => {
                const blocked = blockedAction(order.status);
                const expanded = open === order.id;
                return (
                  <li key={order.id} className={s.card} data-testid={T(`order-${order.number}`)}>
                    <div className={s.cardHead}>
                      <strong className="wb-text-body-strong">Pedido {order.number}</strong>
                      <Badge tone={ORDER_STATUS_TONE[order.status] === 'neutral' ? 'neutral' : ORDER_STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                    </div>
                    <p className="wb-text-body" style={{ margin: 0 }}>
                      <strong>{order.customerFirstName}</strong> · {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}
                    </p>
                    <p className={cx('wb-text-caption', s.help)}>{order.firstItemName}</p>
                    <p className="wb-text-caption" style={{ margin: 0 }}>
                      {order.total ? <strong className={s.tnum}>{formatCents(order.total.amount)} · </strong> : null}
                      Recebido às {formatClock(order.paidAt ?? order.createdAt)}
                    </p>
                    <div className={s.cardHead}>
                      {blocked ? <OnlyMerchantTag label={blocked} /> : <span />}
                      <span style={{ display: 'inline-flex', gap: 16, flexWrap: 'wrap' }}>
                        <button type="button" className={cx('wb-text-body-strong', s.link)} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : order.id)} data-testid={T(`order-${order.number}-toggle`)}>
                          {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                        </button>
                        <Link href={asRoute(`/admin/pedidos/${order.id}`)} target="_blank" rel="noopener" className={cx('wb-text-body-strong', s.link)} aria-label={`Abrir a ficha do pedido ${order.number} na Webag, em outra aba`}>
                          Ficha na Webag (outra aba)
                        </Link>
                      </span>
                    </div>
                    {expanded ? <OrderDetail storeId={storeId} orderId={order.id} onExpired={onExpired} /> : null}
                  </li>
                );
              })}
            </ul>
            <LoadMore query={query} />
          </>
        )}
      </ViewAsBoundary>
    </>
  );
}

const PRODUCT_STATUS = { draft: 'Rascunho', active: 'À venda', paused: 'Pausado', archived: 'Arquivado' } as const;

export function ProductsScreen({ storeId, onExpired }: ScreenProps) {
  const query = useInfiniteQuery({
    queryKey: viewAsKeys.read(storeId, 'products'),
    queryFn: ({ pageParam }) => viewAsApi.products(storeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.data),
    retry: false,
  });
  return (
    <ViewAsBoundary query={query} onExpired={onExpired} isEmpty={(rows) => rows.length === 0} empty={{ title: 'Nenhum produto nesta loja', text: 'Quando a loja cadastrar produtos, eles aparecem aqui.' }}>
      {(rows) => (
        <>
          <ul className={s.list} data-testid={T('products')}>
            {rows.map((product) => {
              const price = product.fromPriceCents ?? product.basePriceCents;
              return (
                <li key={product.id} className={s.line}>
                  <Thumb cover={product.cover} />
                  <div className={s.lineGrow}>
                    <strong className="wb-text-body-strong">{product.name}</strong>
                    <div className={cx('wb-text-caption', s.help)}>
                      <span className={s.tnum}>{price === null ? 'Sem preço' : formatCents(price)}</span> · {product.availableTotal} em estoque · {PRODUCT_STATUS[product.status]}
                    </div>
                  </div>
                  <OnlyMerchantTag />
                </li>
              );
            })}
          </ul>
          <Help>Alterar preço e estoque: só o lojista.</Help>
          <LoadMore query={query} />
        </>
      )}
    </ViewAsBoundary>
  );
}

const REASON_LABEL: Record<string, string> = { size: 'Tamanho', color: 'Cor' };

export function ExchangesScreen({ storeId, onExpired }: ScreenProps) {
  const query = useInfiniteQuery({
    queryKey: viewAsKeys.read(storeId, 'exchanges'),
    queryFn: ({ pageParam }) => viewAsApi.exchanges(storeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ExchangePageViewAs) => last.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.data),
    refetchInterval: POLL_MS,
    retry: false,
  });
  return (
    <>
      <Help>O texto e as fotos do cliente não aparecem nesta visualização.</Help>
      <ViewAsBoundary query={query} onExpired={onExpired} isEmpty={(rows) => rows.length === 0} empty={{ title: 'Nenhuma troca aberta', text: 'Quando um cliente pedir troca, ela aparece aqui.' }}>
        {(rows) => (
          <>
            <ul className={s.list} data-testid={T('exchanges')}>
              {rows.map((exchange) => (
                <li key={exchange.id} className={s.card}>
                  <div className={s.cardHead}>
                    <strong className="wb-text-body-strong">Troca {exchange.number}</strong>
                    <Badge tone="neutral">{EXCHANGE_STATUS_LABEL[exchange.status]}</Badge>
                  </div>
                  <p className="wb-text-caption" style={{ margin: 0 }}>
                    Pedido {exchange.orderNumber}
                    {exchange.item?.name ? ` · ${exchange.quantity}x ${exchange.item.name}` : ''}
                  </p>
                  <p className="wb-text-caption" style={{ margin: 0 }}>
                    <strong>Motivo:</strong> {exchange.reasonCode ? `${EXCHANGE_TYPE_LABEL[exchange.type]}: ${REASON_LABEL[exchange.reasonCode] ?? exchange.reasonCode}` : EXCHANGE_TYPE_LABEL[exchange.type]}
                  </p>
                  <p className={cx('wb-text-caption', s.help)}>Responder até {formatDateTime(exchange.answerDeadlineAt)}</p>
                </li>
              ))}
            </ul>
            <LoadMore query={query} />
          </>
        )}
      </ViewAsBoundary>
    </>
  );
}

export function ReviewsScreen({ storeId, onExpired }: ScreenProps) {
  const summary = useQuery({ queryKey: viewAsKeys.read(storeId, 'reviews-summary'), queryFn: () => viewAsApi.reviewsSummary(storeId), retry: false });
  const query = useInfiniteQuery({
    queryKey: viewAsKeys.read(storeId, 'reviews'),
    queryFn: ({ pageParam }) => viewAsApi.reviews(storeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.data),
    retry: false,
  });
  return (
    <>
      <Help>Igual ao que os clientes veem na vitrine.</Help>
      <ViewAsBoundary query={query} onExpired={onExpired} isEmpty={(rows) => rows.length === 0} empty={{ title: 'Ainda sem avaliações', text: 'Quando um cliente avaliar, aparece aqui.' }}>
        {(rows) => (
          <>
            {summary.data && summary.data.average !== null ? (
              <div className={s.card} data-testid={T('reviews-summary')}>
                <span>
                  <strong className={cx('wb-text-title2', s.tnum)}>{summary.data.average.toFixed(1).replace('.', ',')}</strong> de 5 · {summary.data.total} {summary.data.total === 1 ? 'avaliação' : 'avaliações'}
                </span>
              </div>
            ) : null}
            <ul className={s.list}>
              {rows.map((review) => (
                <li key={review.id} className={s.card}>
                  <span>
                    <strong>{review.reviewer}</strong> · {review.rating} de 5
                  </span>
                  {review.comment ? <p className="wb-text-body" style={{ margin: 0 }}>{review.comment}</p> : null}
                </li>
              ))}
            </ul>
            <LoadMore query={query} />
          </>
        )}
      </ViewAsBoundary>
    </>
  );
}

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function hoursText(hours: StoreSettingsViewAs['hours']): string {
  const open = hours.filter((day) => day.intervals.length > 0);
  if (open.length === 0) return 'Sem horário cadastrado';
  return open.map((day) => `${WEEKDAY[day.weekday] ?? day.weekday}: ${day.intervals.map((i) => `${i.start} às ${i.end}`).join(' e ')}`).join('. ');
}

function pauseText(pause: StoreSettingsViewAs['pause']): string {
  if (!pause.active) return 'Sem pausa agora';
  if (pause.indefinitely || !pause.until) return 'Pausada até o lojista reabrir';
  return `Pausada até ${formatDateTime(pause.until)}`;
}

/** Dados da loja: só o que a API manda na visão (lista fechada). Nada de CNPJ, razão social, comissão nem contato de notificação. */
export function StoreDataScreen({ storeId, onExpired }: ScreenProps) {
  const store = useQuery<StoreViewAs>({ queryKey: viewAsKeys.read(storeId, 'store'), queryFn: () => viewAsApi.store(storeId), retry: false });
  const settings = useQuery({ queryKey: viewAsKeys.read(storeId, 'settings'), queryFn: () => viewAsApi.settings(storeId), retry: false });
  const bundle: BoundaryQuery<{ store: StoreViewAs; settings: StoreSettingsViewAs }> = {
    data: store.data && settings.data ? { store: store.data, settings: settings.data } : undefined,
    isError: store.isError || settings.isError,
    error: store.error ?? settings.error,
    refetch: () => Promise.all([store.refetch(), settings.refetch()]),
  };
  return (
    <ViewAsBoundary query={bundle} onExpired={onExpired} empty={{ title: '', text: '' }}>
      {(data) => (
        <>
          <dl className={s.dl} data-testid={T('store-data')}>
            <div>
              <dt className="wb-text-caption-strong">Loja</dt>
              <dd>
                <strong>{data.store.name}</strong> · {data.settings.isOpenNow ? 'Aberta agora' : 'Fechada agora'}
              </dd>
            </div>
            <div>
              <dt className="wb-text-caption-strong">Horário</dt>
              <dd>{hoursText(data.settings.hours)}</dd>
            </div>
            <div>
              <dt className="wb-text-caption-strong">Pausa</dt>
              <dd>{pauseText(data.settings.pause)}</dd>
            </div>
            <div>
              <dt className="wb-text-caption-strong">Entrega e retirada</dt>
              <dd>{[data.settings.delivery.acceptsDelivery ? 'Entrega' : null, data.settings.pickup.enabled ? 'Retirada na loja' : null].filter(Boolean).join(' e ') || 'Sem entrega nem retirada'}</dd>
            </div>
            <div>
              <dt className="wb-text-caption-strong">Política de troca</dt>
              <dd>{data.settings.exchangePolicy.voluntaryDays > 0 ? `Troca voluntária em até ${data.settings.exchangePolicy.voluntaryDays} dias` : 'Sem troca voluntária (valem só os prazos da lei)'}</dd>
            </div>
          </dl>
          <Help>CNPJ, razão social, comissão, conta de recebimento e contatos de notificação não aparecem nesta visualização.</Help>
        </>
      )}
    </ViewAsBoundary>
  );
}

export const MORE_OPEN = [
  { aba: 'troca', label: 'Trocas' },
  { aba: 'aval', label: 'Avaliações' },
  { aba: 'loja', label: 'Dados da loja, horário e política de troca' },
] as const;
export const MORE_CLOSED = ['Equipe e convites', 'Cupons', 'Conversa com clientes', 'Documentos', 'Comanda', 'Notificações da loja', 'Exportações'] as const;

/** "Mais": os itens da lista fechada abrem; o resto é linha inerte com selo (sem link, sem foco). */
export function MoreScreen({ storeId }: { storeId: string }) {
  return (
    <ul className={s.list} data-testid={T('more')}>
      {MORE_OPEN.map((item) => (
        <li key={item.aba}>
          <Link href={asRoute(`/admin/lojas/${storeId}/ver-como?aba=${item.aba}`)} className={cx(s.line, 'wb-text-body-strong')} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className={s.lineGrow}>{item.label}</span>
            <CaretRight size={20} aria-hidden="true" />
          </Link>
        </li>
      ))}
      {MORE_CLOSED.map((label) => (
        <li key={label} className={cx(s.line, s.lineOff)} data-testid={T('closed-item')}>
          <span className={s.lineGrow}>{label}</span>
          <OnlyMerchantTag />
        </li>
      ))}
    </ul>
  );
}


