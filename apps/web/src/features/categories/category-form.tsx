'use client';

import { Check } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import s from '@/components/panel/panel.module.css';
import { Banner, Button, CheckboxField, SelectField, TextField, cx, ui, useToast } from '@/components/ui';
import { adminApi, keys, type Category, type CategoryNode } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { tid } from '@/lib/testid';
import { CategoryIcon, iconLabel } from './icons';

const T = (id: string) => tid('categorias', id);
const NAME_MAX = 30;

function IconPicker({ icons, value, onChange, error }: { icons: string[]; value: string; onChange: (icon: string) => void; error?: string }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => icons.filter((icon) => iconLabel(icon).toLowerCase().includes(search.trim().toLowerCase())), [icons, search]);
  return (
    <div className={ui.stack} data-testid={T('icon-picker')} role="group" aria-label="Ícone">
      <TextField label="Ícone" type="search" placeholder="Buscar ícone pelo nome" aria-label="Buscar ícone pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} error={error} autoComplete="off" />
      <div className={s.iconGrid}>
        {filtered.map((icon) => (
          <button key={icon} type="button" className={s.iconCell} aria-pressed={value === icon} onClick={() => onChange(icon)} data-testid={T(`icon-${icon}`)}>
            {value === icon ? <Check size={16} weight="bold" className={s.iconCheck} aria-hidden="true" /> : null}
            <CategoryIcon name={icon} />
            <span className="wb-text-micro">{iconLabel(icon)}</span>
          </button>
        ))}
        {filtered.length === 0 ? <p className="wb-text-body">Nenhum ícone com esse nome.</p> : null}
      </div>
    </div>
  );
}

/** Formulário de categoria (AD2). `category` vazio = nova. A API só aceita escolher "Pertence a" na criação. */
export function CategoryForm({ category, tree, icons, defaultParentId, onDone, onCancel }: { category: Category | null; tree: CategoryNode[]; icons: string[]; defaultParentId: string | null; onDone: () => void; onCancel: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [parentId, setParentId] = useState<string | null>(category ? category.parentId : defaultParentId);
  const [active, setActive] = useState(category?.active ?? true);
  const [errors, setErrors] = useState<{ name?: string; icon?: string; form?: string }>({});

  const save = useMutation({
    mutationFn: () =>
      category
        ? adminApi.updateCategory(category.id, { name: name.trim(), icon, active })
        : adminApi.createCategory({ name: name.trim(), icon, parentId, active, position: parentId ? (tree.find((n) => n.id === parentId)?.children.length ?? 0) : tree.length }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.categories });
      toast.show('Categoria salva.');
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CATEGORY_NAME_TAKEN') setErrors({ name: 'Já existe uma categoria com esse nome aqui.' });
      else if (error instanceof ApiError && error.code === 'CATEGORY_ICON_INVALID') setErrors({ icon: 'Escolha um ícone.' });
      else setErrors({ form: saveErrorMessage(error) });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Digite o nome da categoria.';
    if (!icon) next.icon = 'Escolha um ícone.';
    setErrors(next);
    if (next.name || next.icon) return;
    save.mutate();
  }

  const parentLabel = parentId ? (tree.find((n) => n.id === parentId)?.name ?? '') : '';
  return (
    <form onSubmit={submit} className={ui.stack} noValidate>
      <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))} counter={{ value: name.length, max: NAME_MAX }} error={errors.name} autoComplete="off" data-testid={T('name-input')} />
      <IconPicker icons={icons} value={icon} onChange={setIcon} error={errors.icon} />
      {category ? (
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>
          Pertence a: {parentLabel || 'Nenhuma, é categoria principal'}. Mover de nível ainda não é possível.
        </p>
      ) : (
        <SelectField label="Pertence a" value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || null)} data-testid={T('parent-select')}>
          <option value="">Nenhuma, é categoria principal</option>
          {tree.map((node) => (
            <option key={node.id} value={node.id}>{node.name}</option>
          ))}
        </SelectField>
      )}
      <CheckboxField label="Ativa" checked={active} onChange={(e) => setActive(e.target.checked)} data-testid={T('active-switch')} />
      <div className={s.preview} data-testid={T('preview')}>
        <span className="wb-text-caption-strong">Como aparece no app</span>
        <span className={s.previewCircle}>{icon ? <CategoryIcon name={icon} size={32} /> : null}</span>
        <span className="wb-text-caption">{name || 'Nome da categoria'}</span>
      </div>
      {errors.form ? <Banner tone="danger">{errors.form}</Banner> : null}
      <div className={ui.row}>
        <Button type="submit" loading={save.isPending} loadingLabel="Salvando…" data-testid={T('submit')}>Salvar categoria</Button>
        <Button variant="text" onClick={onCancel} disabled={save.isPending}>Cancelar</Button>
      </div>
    </form>
  );
}
