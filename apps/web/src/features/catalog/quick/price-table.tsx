'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, Button, ErrorState, MessageState, SkeletonRows, TextField, cx, ui } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type ProductTableRow } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { MAX_PRICE_CENTS } from '@/lib/catalog/helpers';
import { formatCents } from '@/lib/format';
import { centsFromDigits, moneyField } from '@/lib/money';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { CatalogGate } from '../catalog-gate';
import s from '../catalog.module.css';
import q from './quick.module.css';

const T = (id: string) => ltid('precos', id);
export const SAVE_DELAY_MS = 700;
const OFFLINE_ROW = 'Não salvou: sem internet';

/** `/lojista/produtos/precos`: "Preços e estoque" (WB-377): preço e estoque editáveis em linha, salvando por linha. */
export function PriceTablePage() {
  return <CatalogGate>{(store) => <PriceTable storeId={store.id} />}</CatalogGate>;
}

/** Confirmação inline acima de `reajuste_max_pct` nos dois sentidos (WB-377 C8, RN-Q9): "De R$ 49,90 para R$ 4,99 (-90%). Confirmar?". */
export function priceChangeNote(fromCents: number, toCents: number, limitPct: number): string | null {
  if (fromCents <= 0) return null;
  const pct = ((toCents - fromCents) * 100) / fromCents;
  if (Math.abs(pct) <= limitPct) return null;
  const rounded = Math.round(pct);
  return `De ${formatCents(fromCents)} para ${formatCents(toCents)} (${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}%). Confirmar?`;
}

function PriceTable({ storeId }: { storeId: string }) {
  const online = useOnline();
  const [input, setInput] = useState('');
  const [q2, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const start = useQuery({ queryKey: catalogKeys.quickStart(storeId), queryFn: () => catalogApi.quickStart(storeId), staleTime: 60_000 });
  const limitPct = start.data?.limits.reajusteMaxPct ?? 30;
  const list = useInfiniteQuery({
    queryKey: catalogKeys.table(storeId, q2, 'all'),
    queryFn: ({ pageParam }) => catalogApi.table(storeId, { ...(q2 ? { q: q2 } : {}), ...(pageParam ? { cursor: pageParam } : {}), limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  const matching = list.data?.pages[0]?.matchingCount ?? rows.length;

  return (
    <div className={ui.stack}>
      <PageHeader title="Preços e estoque" description={list.data ? `${matching.toLocaleString('pt-BR')} ${matching === 1 ? 'produto' : 'produtos'}` : undefined} />
      {!online ? <Banner tone="warning" offline>Sem conexão. O que você alterar fica na tela. Para salvar, toque em Tentar de novo quando a internet voltar.</Banner> : null}
      <TextField label="Buscar produto" type="search" inputMode="search" autoComplete="off" maxLength={80} placeholder="Nome do produto" value={input} onChange={(event) => setInput(event.target.value)} data-testid={T('search')} />
      {list.isPending ? <SkeletonRows rows={6} height={72} label="Carregando os produtos" /> : null}
      {list.isError && !list.data ? <ErrorState offline={!online || (list.error instanceof ApiError && list.error.isNetwork)} onRetry={() => void list.refetch()} /> : null}
      {list.data && rows.length === 0 ? (
        <MessageState icon={MagnifyingGlass} title={q2 ? 'Nenhum produto com esse nome' : 'Nenhum produto vendendo ou pausado'} text={q2 ? 'Tente outro nome.' : 'Rascunhos ficam na aba Rascunhos de Produtos.'} testId={T('empty')} />
      ) : null}
      {rows.length > 0 ? (
        <div className={q.tableWrap}>
          <table className={ui.table}>
            <caption className="wb-text-caption">Preço e estoque dos produtos da loja</caption>
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Preço (R$)</th>
                <th scope="col">Você recebe</th>
                <th scope="col">Estoque</th>
                <th scope="col"><span className={ui.srOnly}>Situação</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Line key={row.id} storeId={storeId} row={row} limitPct={limitPct} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {list.hasNextPage ? <Button variant="secondary" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('more')}>Mostrar mais</Button> : null}
    </div>
  );
}

type RowState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'confirm'; note: string } | { kind: 'error'; message: string; retry: boolean };

function Line({ storeId, row, limitPct }: { storeId: string; row: ProductTableRow; limitPct: number }) {
  const client = useQueryClient();
  const online = useOnline();
  const [price, setPrice] = useState<number | null>(row.basePriceCents);
  const [stock, setStock] = useState(row.singleVariantId ? String(row.available + row.reserved) : '');
  const [state, setState] = useState<RowState>({ kind: 'idle' });
  const version = useRef(row.version);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedPrice = useRef(row.basePriceCents);
  const savedStock = useRef(row.singleVariantId ? row.available + row.reserved : null);
  const confirmed = useRef<number | null>(null);

  useEffect(() => {
    version.current = Math.max(version.current, row.version);
  }, [row.version]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // O salvamento roda depois de uma pausa: lê sempre o que está na tela agora (não o da renderização que agendou).
  const latest = useRef({ price, stock });
  useEffect(() => {
    latest.current = { price, stock };
  });

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(), SAVE_DELAY_MS);
  }

  function commit(): Promise<void> {
    chain.current = chain.current.then(save, save);
    return chain.current;
  }

  async function save(): Promise<void> {
    const { price, stock } = latest.current;
    const stockNumber = stock.trim() === '' ? null : Number(stock);
    const priceChanged = price !== null && price !== savedPrice.current && price >= 1 && price <= MAX_PRICE_CENTS;
    const stockChanged = row.singleVariantId !== null && stockNumber !== null && Number.isInteger(stockNumber) && stockNumber >= 0 && stockNumber <= 99_999 && stockNumber !== savedStock.current;
    if (!priceChanged && !stockChanged) return;
    if (!online) return setState({ kind: 'error', message: OFFLINE_ROW, retry: true });
    if (priceChanged && confirmed.current !== price) {
      const note = priceChangeNote(savedPrice.current ?? 0, price as number, limitPct);
      if (note) return setState({ kind: 'confirm', note });
    }
    setState({ kind: 'saving' });
    try {
      if (priceChanged) {
        const saved = await catalogApi.updateIfMatch(storeId, row.id, { basePriceCents: price }, version.current);
        version.current = saved.version ?? version.current;
        savedPrice.current = price;
      }
      if (stockChanged && row.singleVariantId) {
        await catalogApi.adjustStock(storeId, row.id, row.singleVariantId, { set: stockNumber as number }, version.current);
        savedStock.current = stockNumber;
        // A resposta é da variação, sem a versão do produto: lê a versão nova para o próximo salvamento.
        const fresh = await catalogApi.get(storeId, row.id);
        version.current = fresh.version ?? version.current + 1;
      }
      confirmed.current = null;
      setState({ kind: 'saved' });
      void client.invalidateQueries({ queryKey: ['lojista', 'catalog', 'table'] });
    } catch (caught) {
      if (caught instanceof ApiError && caught.isNetwork) return setState({ kind: 'error', message: OFFLINE_ROW, retry: true });
      if (caught instanceof ApiError && caught.code === 'PRODUCT_VERSION_CONFLICT') {
        void client.invalidateQueries({ queryKey: ['lojista', 'catalog', 'table'] });
        return setState({ kind: 'error', message: 'Este produto foi alterado agora. Atualizamos a lista; confira e altere de novo.', retry: false });
      }
      setState({ kind: 'error', message: catalogErrorMessage(caught, 'Não salvou. Tente de novo.'), retry: true });
    }
  }

  const label = row.name;
  const receive = row.youReceiveCents;
  return (
    <tr data-testid={T(`row-${row.id}`)}>
      <td data-primary>
        <Link href={asRoute(`/lojista/produtos/${row.id}`)} className={cx('wb-text-body-strong', s.productName, s.editLink)} style={{ overflowWrap: 'anywhere' }}>{label}</Link>
        {row.status === 'paused' ? <span className={cx('wb-text-caption', ui.muted)}> · Pausado</span> : null}
      </td>
      <td data-label="Preço">
        <TextField
          label={`Preço de ${label}`}
          inputMode="decimal"
          value={moneyField(price)}
          onChange={(event) => {
            const cents = centsFromDigits(event.target.value);
            setPrice(cents > 0 ? cents : null);
            confirmed.current = null;
            setState({ kind: 'idle' });
            schedule();
          }}
          data-testid={T(`price-${row.id}`)}
        />
      </td>
      <td data-label="Você recebe" className="wb-text-body" data-testid={T(`receive-${row.id}`)}>{receive !== null ? formatCents(receive) : '—'}</td>
      <td data-label="Estoque">
        {row.singleVariantId ? (
          <>
            <TextField
              label={`Estoque de ${label}`}
              inputMode="numeric"
              value={stock}
              onChange={(event) => {
                setStock(event.target.value.replace(/\D/g, '').slice(0, 5));
                setState({ kind: 'idle' });
                schedule();
              }}
              data-testid={T(`stock-${row.id}`)}
            />
            {row.reserved > 0 ? <p className={cx('wb-text-caption', q.rowNote)}>{row.reserved} {row.reserved === 1 ? 'reservada' : 'reservadas'} em pedidos</p> : null}
          </>
        ) : (
          <Link href={asRoute(`/lojista/produtos/${row.id}`)} className={cx(s.productName, s.editLink)} data-testid={T(`options-${row.id}`)}>{row.available.toLocaleString('pt-BR')} em {row.variantCount} opções: abrir</Link>
        )}
      </td>
      <td data-label="Situação" role="status" aria-live="polite">
        {state.kind === 'saving' ? <span className="wb-text-caption">Salvando…</span> : null}
        {state.kind === 'saved' ? <span className="wb-text-caption" data-testid={T(`saved-${row.id}`)}>Salvo</span> : null}
        {state.kind === 'confirm' ? (
          <span className={q.fillAll} data-testid={T(`confirm-${row.id}`)}>
            <span className="wb-text-caption">{state.note}</span>
            <Button
              size="sm"
              onClick={() => {
                confirmed.current = price;
                void commit();
              }}
              data-testid={T(`confirm-yes-${row.id}`)}
            >
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="text"
              onClick={() => {
                setPrice(savedPrice.current);
                setState({ kind: 'idle' });
              }}
            >
              Cancelar
            </Button>
          </span>
        ) : null}
        {state.kind === 'error' ? (
          <span className={q.fillAll} data-testid={T(`error-${row.id}`)}>
            <span className={cx('wb-text-caption', q.rowErr)}>{state.message}</span>
            {state.retry ? <Button size="sm" variant="secondary" onClick={() => void commit()} data-testid={T(`retry-${row.id}`)}>Tentar de novo</Button> : null}
          </span>
        ) : null}
      </td>
    </tr>
  );
}
