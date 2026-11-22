'use client';

import { MagnifyingGlass, Package } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, Button, ButtonLink, ErrorState, MessageState, SelectField, SkeletonRows, TextField, cx, ui } from '@/components/ui';
import { catalogApi, catalogKeys, type ProductFilter, type ProductQuery } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { BULK_MAX, BulkBar } from './bulk-bar';
import { LojistaNoAccess } from '../loja/settings-screen';
import { CatalogGate, isCatalogOwner } from './catalog-gate';
import { ProductRow } from './product-row';
import { DraftsPanel } from './quick/drafts-panel';
import { NewProductLink } from './quick/new-product-link';
import { missingText, savedAgo } from '@/lib/catalog/quick';
import s from './catalog.module.css';
import qs from './quick/quick.module.css';

const T = (id: string) => ltid('produtos', id);

export const FILTERS: { id: ProductFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Vendendo' },
  { id: 'paused', label: 'Pausados' },
  { id: 'low', label: 'Estoque baixo' },
  { id: 'draft', label: 'Rascunhos' },
];
const PAGE_SIZES = [25, 50, 100] as const;
const SEARCH_DELAY_MS = 300;

export function ProductsPage({ initialFilter = 'all' }: { initialFilter?: ProductFilter }) {
  return <CatalogGate>{(store) => <ProductList storeId={store.id} owner={isCatalogOwner(store)} initialFilter={initialFilter} />}</CatalogGate>;
}

/** K1: lista de produtos com busca, filtros, ajuste rápido de estoque, pausa com 1 toque e ação em massa. */
function ProductList({ storeId, owner, initialFilter }: { storeId: string; owner: boolean; initialFilter: ProductFilter }) {
  const online = useOnline();
  const [filter, setFilter] = useState<ProductFilter>(initialFilter);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updated, setUpdated] = useState<Set<string>>(new Set());
  // No celular a caixa de seleção só aparece no modo "Selecionar"; no computador ela é sempre visível.
  const [selecting, setSelecting] = useState(false);
  const query: ProductQuery = { filter, q };

  // Busca com atraso: uma chamada por pausa na digitação, não por tecla (rede móvel).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timer.current = setTimeout(() => setQ(input), SEARCH_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input]);

  const draftsView = filter === 'draft';
  // Ponto de partida do cadastro rápido (WB-371 C1: "Continuar: ..."; RN-Q1: "X produtos sem descrição"). Falhar aqui nunca esconde a lista.
  const start = useQuery({ queryKey: catalogKeys.quickStart(storeId), queryFn: () => catalogApi.quickStart(storeId), staleTime: 30_000 });
  const latest = start.data?.latestDraft ?? null;
  const withoutDescription = start.data?.withoutDescriptionCount ?? 0;

  const list = useInfiniteQuery({
    queryKey: [...catalogKeys.list(storeId, query), limit],
    queryFn: ({ pageParam }) => catalogApi.list(storeId, query, pageParam, limit),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !draftsView,
  });

  const products = useMemo(() => (list.data?.pages.flatMap((page) => page.data) ?? []).filter((product) => product.status !== 'archived'), [list.data]);
  const selectedProducts = products.filter((product) => selected.has(product.id));
  const filtered = filter !== 'all' || q !== '';
  const clearFilters = () => {
    setFilter('all');
    setInput('');
    setQ('');
  };

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allSelected = products.length > 0 && products.every((product) => selected.has(product.id));
  const addButton = <NewProductLink className={s.addButton} />;

  return (
    <div className={ui.stack}>
      <PageHeader
        title="Produtos"
        description={list.data ? `${products.length.toLocaleString('pt-BR')}${list.hasNextPage ? '+' : ''} ${products.length === 1 && !list.hasNextPage ? 'produto' : 'produtos'}` : undefined}
        action={
          <div className={ui.row}>
            <ButtonLink href={asRoute('/lojista/produtos/adicionar-varios')} variant="secondary" data-testid={T('paste-link')}>Adicionar vários</ButtonLink>
            <ButtonLink href={asRoute('/lojista/produtos/precos')} variant="secondary" data-testid={T('prices-link')}>Preços e estoque</ButtonLink>
            <ButtonLink href={asRoute('/lojista/produtos/importar')} variant="text" data-testid={T('import-link')}>Importar planilha</ButtonLink>
            <ButtonLink href={asRoute('/lojista/produtos/secoes')} variant="text" data-testid={T('sections-link')}>Seções da vitrine</ButtonLink>
          </div>
        }
      />
      {!online ? <Banner tone="warning" offline>Sem conexão. Mostrando o que já carregou.</Banner> : null}
      {latest && !draftsView ? (
        <div className={qs.continueCard} data-testid={T('continue')}>
          <p className="wb-text-body-strong" style={{ margin: 0, overflowWrap: 'anywhere' }}>Continuar: {latest.name.trim() || 'produto sem nome'}</p>
          <p className="wb-text-caption" style={{ margin: 0 }}>{missingText(latest.missing)} · {savedAgo(latest.updatedAt)}</p>
          <ButtonLink href={asRoute(`/lojista/produtos/novo/${latest.id}`)} variant="secondary" size="sm" data-testid={T('continue-link')} aria-label={`Continuar ${latest.name.trim() || 'produto sem nome'}`}>Continuar</ButtonLink>
        </div>
      ) : null}
      {withoutDescription > 0 && !draftsView ? (
        <Banner tone="info" testId={T('without-description')}>
          {withoutDescription} {withoutDescription === 1 ? 'produto sem descrição' : 'produtos sem descrição'}. Com descrição o cliente decide mais rápido.
        </Banner>
      ) : null}
      <div className={s.toolbar}>
        <div className={s.searchRow}>
          <TextField
            className={s.search}
            label="Buscar produto"
            type="search"
            inputMode="search"
            autoComplete="off"
            maxLength={80}
            placeholder="Nome do produto"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            data-testid={T('search-input')}
          />
          {products.length > 0 ? (
            <Button
              variant="text"
              size="sm"
              className={s.selectToggle}
              aria-pressed={selecting}
              onClick={() => {
                if (selecting) setSelected(new Set());
                setSelecting(!selecting);
              }}
              data-testid={T('select-mode')}
            >
              {selecting ? 'Cancelar seleção' : 'Selecionar'}
            </Button>
          ) : null}
        </div>
        <div className={s.chips} role="group" aria-label="Filtrar produtos">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" className={cx(ui.chip, 'wb-text-body')} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} data-testid={T(`filter-${item.id}`)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {draftsView ? (
        <DraftsPanel storeId={storeId} />
      ) : (
        <>
      {list.isPending ? <SkeletonRows rows={6} height={72} label="Carregando os produtos" /> : null}
      {list.isError && !list.data && list.error instanceof ApiError && (list.error.status === 403 || list.error.status === 404) ? <LojistaNoAccess /> : null}
      {list.isError && !list.data && !(list.error instanceof ApiError && (list.error.status === 403 || list.error.status === 404)) ? (
        <ErrorState offline={!online || (list.error instanceof ApiError && list.error.isNetwork)} onRetry={() => void list.refetch()} />
      ) : null}
      {list.data && products.length === 0 ? (
        filtered ? (
          <MessageState icon={MagnifyingGlass} title="Nenhum produto neste filtro." testId={T('no-results')}>
            <Button onClick={clearFilters} data-testid={T('clear-filters')}>Limpar filtros</Button>
          </MessageState>
        ) : (
          <div className={ui.stack}>
            <MessageState icon={Package} title="Sua vitrine está vazia" text="Tire a foto de um produto para começar. Leva cerca de 1 minuto." testId={T('empty')}>
              <NewProductLink testId={T('empty-add')} />
              <ButtonLink href={asRoute('/lojista/produtos/adicionar-varios')} variant="text" data-testid={T('empty-paste')}>Colar lista do WhatsApp</ButtonLink>
              <ButtonLink href={asRoute('/lojista/produtos/importar')} variant="text">Importar planilha</ButtonLink>
            </MessageState>
          </div>
        )
      ) : null}

      {products.length > 0 ? (
        <>
          {selected.size > 0 ? (
            <>
              <BulkBar
                storeId={storeId}
                selected={selectedProducts}
                canChangePrice={owner}
                onClear={() => setSelected(new Set())}
                onDone={(ids) => {
                  setUpdated((current) => new Set([...current, ...ids]));
                  setSelected(new Set());
                }}
              />
              {selected.size > BULK_MAX ? <Banner tone="warning">O máximo é {BULK_MAX} produtos por vez. Desmarque alguns.</Banner> : null}
            </>
          ) : null}
          <div className={ui.tableWrap}>
            <table className={cx(ui.table, s.productsTable, selecting && s.selecting)}>
              <caption className="wb-text-caption">Produtos da loja</caption>
              <thead>
                <tr>
                  <th scope="col" className={s.checkCell}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => setSelected(event.target.checked ? new Set(products.map((product) => product.id)) : new Set())}
                      aria-label={`Selecionar todos os ${products.length}`}
                      data-testid={T('select-all')}
                    />
                  </th>
                  <th scope="col">Produto</th>
                  <th scope="col">Preço</th>
                  <th scope="col">Estoque</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className={ui.srOnly}>Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <ProductRow key={product.id} storeId={storeId} product={product} selected={selected.has(product.id)} onSelect={(checked) => toggle(product.id, checked)} updated={updated.has(product.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className={ui.row} style={{ justifyContent: 'space-between' }}>
            <SelectField label="Por página" value={String(limit)} onChange={(event) => setLimit(Number(event.target.value) as (typeof PAGE_SIZES)[number])} data-testid={T('page-size')}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </SelectField>
            {list.hasNextPage ? (
              <Button variant="secondary" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('load-more')}>
                Mostrar mais
              </Button>
            ) : null}
          </div>
          {list.isError ? <Banner tone="danger">Não conseguimos carregar mais produtos. Tente de novo em instantes.</Banner> : null}
        </>
      ) : null}

        </>
      )}

      {!draftsView ? <div className={s.addWrap}>{addButton}</div> : null}
    </div>
  );
}
