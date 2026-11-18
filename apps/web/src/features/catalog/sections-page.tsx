'use client';

import { ArrowDown, ArrowUp, CaretLeft, DotsSixVertical, Rows } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Badge, Banner, Button, CheckboxField, Dialog, EmptyState, QueryBoundary, SkeletonRows, TextField, cx, ui, useToast } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type Section } from '@/lib/api/catalog';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { CatalogGate } from './catalog-gate';
import s from './catalog.module.css';

const T = (id: string) => ltid('secoes', id);
const NAME_MAX = 40;
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function SectionsPage() {
  return <CatalogGate>{(store) => <Sections storeId={store.id} />}</CatalogGate>;
}

/** K4: seções da vitrine. Reordenar por botões "Subir/Descer" ou arrastando; "Outros" fica sempre por último. */
function Sections({ storeId }: { storeId: string }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const query = useQuery({ queryKey: catalogKeys.sections(storeId), queryFn: () => catalogApi.sections(storeId) });
  const [editing, setEditing] = useState<Section | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  async function reorder(list: Section[], from: number, to: number) {
    if (to < 0 || to >= list.length || from === to) return;
    if (!online) return setError('Conecte-se para mudar a ordem.');
    setError(null);
    const next = list.slice();
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    // Mostra a nova ordem já; se a API recusar, volta ao que o servidor tem.
    client.setQueryData(catalogKeys.sections(storeId), { data: next.map((item, position) => ({ ...item, position })), nextCursor: null });
    try {
      await catalogApi.orderSections(storeId, next.map((item) => item.id));
      toast.show('Ordem salva.');
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não foi possível salvar a ordem. Tente de novo.'));
    } finally {
      await client.invalidateQueries({ queryKey: catalogKeys.sections(storeId) });
    }
  }

  function drop(event: DragEvent, list: Section[], target: string) {
    event.preventDefault();
    const from = list.findIndex((item) => item.id === dragging);
    const to = list.findIndex((item) => item.id === target);
    setDragging(null);
    if (from >= 0 && to >= 0) void reorder(list, from, to);
  }

  async function remove(section: Section) {
    try {
      await catalogApi.deleteSection(storeId, section.id);
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      setDeleting(null);
      toast.show('Seção excluída.');
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não foi possível excluir. Tente de novo.'));
      setDeleting(null);
    }
  }

  return (
    <div className={ui.stack}>
      <div>
        <Link href={asRoute('/lojista/produtos')} className={s.productName} data-testid={T('back')}>
          <CaretLeft size={16} aria-hidden="true" /> Produtos
        </Link>
      </div>
      <div className={ui.pageHeader}>
        <h1 ref={heading} className="wb-text-title1" tabIndex={-1} style={{ margin: 0, outline: 'none' }}>Seções da vitrine</h1>
        <Button onClick={() => setEditing('new')} data-testid={T('create')}>Criar seção</Button>
      </div>
      {!online ? <Banner tone="warning" offline>Sem conexão. Mostrando o que já carregou.</Banner> : null}
      {error ? <Banner tone="danger" testId={T('error')}>{error}</Banner> : null}
      <QueryBoundary
        query={query}
        skeleton={<SkeletonRows rows={4} height={64} label="Carregando as seções" />}
        empty={(data) =>
          data.data.length === 0 ? (
            <EmptyState icon={Rows} title="Nenhuma seção ainda" text="Seções ajudam o cliente a achar rápido. Ex.: Camisetas, Promoções." actionLabel="Criar seção" onAction={() => setEditing('new')} testId={T('empty')} />
          ) : null
        }
      >
        {(data) => {
          const list = data.data.slice().sort((a, b) => a.position - b.position);
          return (
            <ul className={s.sectionList} data-testid={T('list')}>
              {list.map((section, index) => (
                <li
                  key={section.id}
                  className={cx(s.sectionRow, dragging && dragging !== section.id && s.sectionRowDrop)}
                  draggable
                  onDragStart={() => setDragging(section.id)}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => drop(event, list, section.id)}
                  data-testid={T(`section-${section.id}`)}
                >
                  <span className={s.handle} aria-hidden="true"><DotsSixVertical size={24} /></span>
                  <span className={s.sectionName}>
                    <span className="wb-text-body-strong">{section.name}</span>
                    <span className={cx('wb-text-caption', ui.muted)}>{plural(section.productCount, 'produto', 'produtos')}</span>
                    {section.productCount === 0 ? <Badge tone="warning">Escondida: sem produto ativo</Badge> : null}
                  </span>
                  <span className={s.sectionActions}>
                    <button type="button" className={ui.iconButton} aria-label={`Subir a seção ${section.name}`} disabled={index === 0} onClick={() => void reorder(list, index, index - 1)} data-testid={T(`section-${section.id}-up`)}>
                      <ArrowUp size={20} aria-hidden="true" />
                    </button>
                    <button type="button" className={ui.iconButton} aria-label={`Descer a seção ${section.name}`} disabled={index === list.length - 1} onClick={() => void reorder(list, index, index + 1)} data-testid={T(`section-${section.id}-down`)}>
                      <ArrowDown size={20} aria-hidden="true" />
                    </button>
                    <Button variant="text" size="sm" onClick={() => setEditing(section)} aria-label={`Editar a seção ${section.name}`} data-testid={T(`section-${section.id}-edit`)}>Editar</Button>
                    <Button variant="text" size="sm" onClick={() => setDeleting(section)} aria-label={`Excluir a seção ${section.name}`} data-testid={T(`section-${section.id}-delete`)}>Excluir</Button>
                  </span>
                </li>
              ))}
              <li className={s.sectionRow} data-testid={T('others')}>
                <span className={s.sectionName}>
                  <span className="wb-text-body-strong">Outros</span>
                  <span className={cx('wb-text-caption', ui.muted)}>Produtos sem seção ficam aqui.</span>
                </span>
              </li>
            </ul>
          );
        }}
      </QueryBoundary>
      {editing ? <SectionSheet storeId={storeId} section={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <Dialog
          title={`Excluir a seção ${deleting.name}?`}
          onClose={() => setDeleting(null)}
          testId={T('delete-dialog')}
          actions={
            <>
              <Button variant="destructive" onClick={() => void remove(deleting)} data-testid={T('delete-confirm')}>Excluir seção</Button>
              <Button variant="text" onClick={() => setDeleting(null)}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Os {plural(deleting.productCount, 'produto vai', 'produtos vão')} para Outros.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

/** Folha de criar e editar: nome e a lista de produtos com caixa e busca. */
function SectionSheet({ storeId, section, onClose }: { storeId: string; section: Section | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [name, setName] = useState(section?.name ?? '');
  const [nameError, setNameError] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const products = useInfiniteQuery({
    queryKey: ['lojista', 'catalog', 'section-products', storeId, q],
    queryFn: ({ pageParam }) => catalogApi.list(storeId, { filter: 'all', q }, pageParam, 100),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = (products.data?.pages.flatMap((page) => page.data) ?? []).filter((product) => product.status !== 'archived');
  const isIn = (id: string, sectionId: string | null): boolean => checked[id] ?? (section !== null && sectionId === section.id);

  async function save() {
    const trimmed = name.trim();
    if (trimmed === '') return setNameError('Escreva o nome da seção.');
    if (!online) return setError('Conecte-se para salvar. O que você digitou continua aqui.');
    setBusy(true);
    setError(null);
    try {
      let id = section?.id;
      if (!section) id = (await catalogApi.createSection(storeId, trimmed)).id;
      else if (trimmed !== section.name) await catalogApi.renameSection(storeId, section.id, trimmed);
      if (!id) throw new Error('sem id');
      const toAdd = items.filter((product) => checked[product.id] === true && product.sectionId !== id).map((product) => product.id);
      const toRemove = items.filter((product) => checked[product.id] === false && product.sectionId === id).map((product) => product.id);
      if (toAdd.length > 0) await catalogApi.bulk(storeId, { productIds: toAdd, action: { type: 'move_section', sectionId: id } });
      if (toRemove.length > 0) await catalogApi.bulk(storeId, { productIds: toRemove, action: { type: 'move_section', sectionId: null } });
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show('Seção salva.');
      onClose();
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não foi possível salvar. O que você digitou continua aqui.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={section ? 'Editar seção' : 'Criar seção'}
      onClose={onClose}
      locked={busy}
      wide
      testId={T('sheet')}
      actions={
        <>
          <Button onClick={() => void save()} loading={busy} loadingLabel="Salvando…" data-testid={T('submit')}>Salvar seção</Button>
          <Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button>
        </>
      }
    >
      <div className={ui.stack}>
        <TextField label="Nome da seção" maxLength={NAME_MAX} value={name} onChange={(event) => { setName(event.target.value); setNameError(undefined); }} counter={{ value: name.length, max: NAME_MAX }} error={nameError} autoComplete="off" data-testid={T('name-input')} />
        <TextField label="Produtos nesta seção" type="search" placeholder="Buscar produto" value={search} onChange={(event) => setSearch(event.target.value)} data-testid={T('product-search')} />
        {products.isPending ? <SkeletonRows rows={3} height={40} label="Carregando os produtos" /> : null}
        {products.isError ? <Banner tone="danger">Não conseguimos carregar os produtos. Tente de novo em instantes.</Banner> : null}
        {products.data && items.length === 0 ? <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>Nenhum produto encontrado.</p> : null}
        <ul className={s.checkList}>
          {items.map((product) => (
            <li key={product.id}>
              <CheckboxField label={product.name} checked={isIn(product.id, product.sectionId)} onChange={(event) => setChecked({ ...checked, [product.id]: event.target.checked })} data-testid={T(`product-${product.id}-check`)} />
            </li>
          ))}
        </ul>
        {products.hasNextPage ? <Button variant="secondary" onClick={() => void products.fetchNextPage()} loading={products.isFetchingNextPage}>Mostrar mais</Button> : null}
        {error ? <Banner tone="danger" testId={T('sheet-error')}>{error}</Banner> : null}
      </div>
    </Dialog>
  );
}
