'use client';

import { UsersThree } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, Button, EmptyState, ErrorState, NoAccessState, SelectField, SkeletonRows, TextField, cx } from '@/components/ui';
import { adminOpsApi, adminOpsKeys, type AdminUserPage, type UserFilters } from '@/lib/api/admin-ops';
import { formatDay } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useIsOffline } from './common';
import s from './ops.module.css';

const T = (id: string) => tid('usuarios', id);
type Row = AdminUserPage['data'][number];

export const ROLE_LABEL = { customer: 'Cliente', merchant: 'Lojista' } as const;
export const USER_STATUS_LABEL = { active: 'Ativa', blocked: 'Bloqueada', deleted: 'Excluída' } as const;
const STATUS_TONE = { active: 'success', blocked: 'danger', deleted: 'neutral' } as const;

/** Texto de erro da busca: a API pede 2+ caracteres; celular só a partir de 4 dígitos (a API decide, aqui só orientamos). */
export function searchError(term: string): string | undefined {
  const text = term.trim();
  return text !== '' && text.length < 2 ? 'Digite ao menos 2 caracteres.' : undefined;
}

/** B4, WB-102 C1: busca de usuários (nome, e-mail, celular com 4+ dígitos ou ID). Dado pessoal sempre mascarado. Só super admin, operação e suporte. */
export function UsersPage() {
  const { canView } = useSession();
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'' | 'customer' | 'merchant'>('');
  const [status, setStatus] = useState<'' | 'active' | 'blocked' | 'deleted'>('');
  const filters: UserFilters = { q: q || undefined, role: role || undefined, status: status || undefined };
  const allowed = canView('usuarios');
  const list = useInfiniteQuery({
    queryKey: adminOpsKeys.userList(filters),
    queryFn: ({ pageParam }) => adminOpsApi.users(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: allowed,
  });
  const offline = useIsOffline(list.error);
  if (!allowed) return <NoAccessState />;

  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const error = searchError(term);
  const filtered = Boolean(q || role || status);
  return (
    <div className={s.page}>
      <PageHeader title="Usuários" description="Encontre uma conta para investigar ou bloquear. Os dados pessoais aparecem mascarados." />
      <form
        role="search"
        className={s.search}
        onSubmit={(event) => {
          event.preventDefault();
          if (!error) setQ(term.trim());
        }}
      >
        <TextField label="Buscar usuário" value={term} onChange={(e) => { setTerm(e.target.value.slice(0, 100)); if (e.target.value.trim() === '') setQ(''); }} error={error} hint="Nome, e-mail, celular (4 dígitos ou mais) ou ID. Pressione Enter." autoComplete="off" data-testid={T('search')} />
        <Button type="submit" variant="secondary" data-testid={T('search-submit')}>Buscar</Button>
      </form>
      <div className={s.filters}>
        <SelectField label="Perfil" value={role} onChange={(e) => setRole(e.target.value as typeof role)} data-testid={T('role')}>
          <option value="">Todos</option>
          <option value="customer">Clientes</option>
          <option value="merchant">Lojistas</option>
        </SelectField>
        <SelectField label="Situação da conta" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} data-testid={T('status')}>
          <option value="">Todas</option>
          <option value="active">Ativas</option>
          <option value="blocked">Bloqueadas</option>
          <option value="deleted">Excluídas</option>
        </SelectField>
      </div>

      {list.isPending ? (
        <SkeletonRows rows={4} height={96} label="Carregando os usuários" />
      ) : list.isError && !list.data ? (
        <ErrorState offline={offline} onRetry={() => void list.refetch()} testId={T('error')} />
      ) : rows.length === 0 ? (
        <EmptyState icon={UsersThree} title={filtered ? 'Nenhum usuário encontrado' : 'Nenhum usuário ainda'} text={filtered ? 'Confira o que foi digitado ou tire os filtros.' : 'As contas criadas no app aparecem aqui.'} testId={T('empty')} />
      ) : (
        <>
          <ul className={s.list} aria-label="Usuários" data-testid={T('list')}>
            {rows.map((row) => <UserCard key={row.id} row={row} />)}
          </ul>
          {list.hasNextPage ? <Button variant="secondary" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('more')}>Ver mais</Button> : null}
        </>
      )}
    </div>
  );
}

function UserCard({ row }: { row: Row }) {
  return (
    <li className={s.card} data-testid={T(`row-${row.id}`)}>
      <div className={s.cardTop}>
        <Link href={asRoute(`/admin/usuarios/${row.id}`)} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T(`open-${row.id}`)}>{row.name}</Link>
        <span className={s.actions}>
          {row.roles.map((r) => <Badge key={r} tone="neutral">{ROLE_LABEL[r]}</Badge>)}
          <Badge tone={STATUS_TONE[row.status]} testId={T(`status-${row.id}`)}>{USER_STATUS_LABEL[row.status]}</Badge>
        </span>
      </div>
      <p className={cx('wb-text-body', s.muted)}>{[row.emailMasked, row.phoneMasked].filter(Boolean).join(' · ') || 'Sem e-mail nem celular'}</p>
      <p className={cx('wb-text-caption', s.muted)}>
        Cadastro em {formatDay(row.createdAt)}
        {row.storeCount > 0 ? ` · ${row.storeCount} ${row.storeCount === 1 ? 'loja' : 'lojas'}` : ''}
        {row.lastLoginAt ? ` · último acesso em ${formatDay(row.lastLoginAt)}` : ' · nunca entrou'}
      </p>
    </li>
  );
}
