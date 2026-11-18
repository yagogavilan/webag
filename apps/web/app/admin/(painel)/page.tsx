import { redirect } from 'next/navigation';
import { EmptyHome } from '@/components/panel/empty-home';
import { visibleNav } from '@/lib/admin-access';
import { getSession } from '@/server/session';

/** Até existir a Visão geral (WB-125, onda 6), o admin cai no 1º item do menu permitido (onda-1b AC1). */
export default async function AdminHome() {
  const session = await getSession('admin');
  if (session.status !== 'ok') redirect('/admin/entrar');
  const first = visibleNav(session.user.adminProfile)[0];
  if (first) redirect(first.href as never);
  return <EmptyHome />;
}
