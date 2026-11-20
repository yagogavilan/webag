'use client';

import { CaretDown, CaretRight, Plus, Tag } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import s from '@/components/panel/panel.module.css';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { SplitLayout } from '@/components/panel/split-layout';
import { ActionMenu, Badge, Button, Dialog, EmptyState, NoAccessState, QueryBoundary, cx, ui, useToast } from '@/components/ui';
import { adminApi, keys, type Category, type CategoryList, type CategoryNode } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { tid } from '@/lib/testid';
import { CategoryForm } from './category-form';
import { CategoryIcon } from './icons';

const T = (id: string) => tid('categorias', id);

type Editing = { mode: 'new'; parentId: string | null } | { mode: 'edit'; category: Category } | null;

/** Nova ordem dos irmãos depois de subir (-1) ou descer (+1) um item. Devolve null nas pontas. */
export function moveWithin(ids: string[], id: string, delta: -1 | 1): string[] | null {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function CategoriesPage() {
  const { canView, canEdit } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: keys.categories, queryFn: adminApi.categories });
  const [editing, setEditing] = useState<Editing>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [inactivate, setInactivate] = useState<Category | null>(null);
  const [remove, setRemove] = useState<Category | null>(null);
  const [blocked, setBlocked] = useState<Category | null>(null);
  const [announce, setAnnounce] = useState('');
  if (!canView('categorias')) return <NoAccessState />;
  const editable = canEdit('categorias');

  async function move(siblings: Category[], item: Category, delta: -1 | 1) {
    const next = moveWithin(siblings.map((c) => c.id), item.id, delta);
    if (!next) return;
    try {
      await adminApi.reorderCategories(next);
      await client.invalidateQueries({ queryKey: keys.categories });
      toast.show('Ordem salva.');
      setAnnounce(`${item.name}, posição ${next.indexOf(item.id) + 1} de ${next.length}`);
    } catch {
      toast.show('Não foi possível salvar a ordem. Tente de novo.');
    }
  }

  async function setActive(category: Category, active: boolean) {
    await adminApi.updateCategory(category.id, { active });
    await client.invalidateQueries({ queryKey: keys.categories });
    toast.show(active ? `${category.name} ativada.` : `${category.name} inativada.`);
  }

  async function doDelete(category: Category) {
    try {
      await adminApi.deleteCategory(category.id);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CATEGORY_IN_USE') {
        setRemove(null);
        setBlocked(category);
        return;
      }
      throw error;
    }
    await client.invalidateQueries({ queryKey: keys.categories });
    toast.show(`${category.name} excluída.`);
  }

  function row(category: Category, siblings: Category[], hasChildren: boolean, node?: CategoryNode) {
    const index = siblings.findIndex((c) => c.id === category.id);
    const open = expanded.has(category.id);
    return (
      <li key={category.id} role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-level={node ? 1 : 2} aria-selected={editing?.mode === 'edit' && editing.category.id === category.id} aria-posinset={index + 1} aria-setsize={siblings.length} data-testid={T(`category-${category.id}`)}>
        <div className={cx(s.listItem, editing?.mode === 'edit' && editing.category.id === category.id && s.listItemSelected)}>
          {hasChildren ? (
            <button type="button" className={ui.iconButton} aria-label={open ? `Recolher ${category.name}` : `Expandir ${category.name}`} onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}>
              {open ? <CaretDown size={20} aria-hidden="true" /> : <CaretRight size={20} aria-hidden="true" />}
            </button>
          ) : (
            <span style={{ width: 48, flex: 'none' }} />
          )}
          <span className={s.previewCircle} style={{ width: 40, height: 40, flex: 'none' }}><CategoryIcon name={category.icon} /></span>
          <button type="button" className={s.listItemMain} onClick={() => setEditing({ mode: 'edit', category })} aria-label={`Editar ${category.name}`}>
            <span className="wb-text-body-strong">{category.name}</span>
            {node ? <span className={cx('wb-text-caption', ui.muted)}>{node.children.length} {node.children.length === 1 ? 'subcategoria' : 'subcategorias'}</span> : null}
          </button>
          {!category.active ? <Badge>Inativa</Badge> : null}
          {editable ? (
            <>
              <Button variant="text" size="sm" onClick={() => void move(siblings, category, -1)} disabled={index === 0} aria-label={`Subir ${category.name}`} data-testid={T(`category-${category.id}-up`)} style={{ minWidth: 48 }}>Subir</Button>
              <Button variant="text" size="sm" onClick={() => void move(siblings, category, 1)} disabled={index === siblings.length - 1} aria-label={`Descer ${category.name}`} data-testid={T(`category-${category.id}-down`)} style={{ minWidth: 48 }}>Descer</Button>
              <ActionMenu
                label={`Ações de ${category.name}`}
                testId={T(`category-${category.id}-menu`)}
                actions={[
                  { label: 'Editar', onSelect: () => setEditing({ mode: 'edit', category }) },
                  ...(node ? [{ label: 'Adicionar subcategoria', onSelect: () => setEditing({ mode: 'new', parentId: category.id }) }] : []),
                  category.active ? { label: 'Inativar', onSelect: () => setInactivate(category) } : { label: 'Ativar', onSelect: () => void setActive(category, true) },
                  { label: 'Excluir', danger: true, onSelect: () => (hasChildren ? setBlocked(category) : setRemove(category)), testId: T(`category-${category.id}-delete`) },
                ]}
              />
            </>
          ) : null}
        </div>
        {hasChildren && open && node ? (
          <ul role="group" className={s.treeChildren}>
            {node.children.map((child) => row(child, node.children, false))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <>
      <PageHeader title="Categorias" description="Como o app organiza as lojas e os produtos." action={editable ? <Button icon={<Plus size={20} aria-hidden="true" />} onClick={() => setEditing({ mode: 'new', parentId: null })} data-testid={T('new-category')}>Nova categoria</Button> : undefined} />
      <QueryBoundary
        query={query}
        skeletonLabel="Carregando categorias"
        empty={(data: CategoryList) => (data.data.length === 0 ? <EmptyState icon={Tag} title="Nenhuma categoria ainda" text="Sem categorias, os lojistas não conseguem cadastrar produtos." actionLabel={editable ? 'Nova categoria' : undefined} onAction={() => setEditing({ mode: 'new', parentId: null })} testId={T('empty')} /> : null)}
      >
        {(data) => (
          <SplitLayout
            panelOpen={editing !== null}
            onClosePanel={() => setEditing(null)}
            panelTitle={editing?.mode === 'edit' ? `Editar ${editing.category.name}` : 'Nova categoria'}
            list={
              <>
                <ul role="tree" aria-label="Categorias" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {data.data.map((node) => row(node, data.data, node.children.length > 0, node))}
                </ul>
                <div role="status" aria-live="polite" className={ui.srOnly}>{announce}</div>
              </>
            }
            panel={editing ? <CategoryForm key={editing.mode === 'edit' ? editing.category.id : `new-${editing.parentId}`} category={editing.mode === 'edit' ? editing.category : null} tree={data.data} icons={data.icons} defaultParentId={editing.mode === 'new' ? editing.parentId : null} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} /> : null}
          />
        )}
      </QueryBoundary>

      {inactivate ? (
        <ReasonDialog title={`Inativar ${inactivate.name}?`} description="Ela some do app e das buscas. Os produtos ficam guardados e os lojistas são avisados." withReason={false} confirmLabel="Inativar categoria" destructive onConfirm={() => setActive(inactivate, false)} onClose={() => setInactivate(null)} testIds={{ confirm: T('inactivate-confirm') }} />
      ) : null}
      {remove ? (
        <ReasonDialog title={`Excluir ${remove.name}?`} description="Essa ação não pode ser desfeita." withReason={false} confirmLabel="Excluir categoria" destructive onConfirm={() => doDelete(remove)} onClose={() => setRemove(null)} testIds={{ confirm: T('delete-confirm') }} />
      ) : null}
      {blocked ? (
        <Dialog title={`Não dá para excluir ${blocked.name}.`} testId={T('delete-blocked')} onClose={() => setBlocked(null)} actions={<><Button onClick={() => { const target = blocked; setBlocked(null); if (target.active) setInactivate(target); }}>Inativar categoria</Button><Button variant="text" onClick={() => setBlocked(null)}>Fechar</Button></>}>
          <p className="wb-text-body" style={{ margin: 0 }}>Ela tem itens vinculados (subcategorias, produtos ou lojas). Mova para outra categoria ou inative.</p>
        </Dialog>
      ) : null}
    </>
  );
}
