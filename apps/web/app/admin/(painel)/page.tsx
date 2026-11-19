import { redirect } from 'next/navigation';
import { AdminHome } from '@/features/admin-home/admin-home';
import { getSession } from '@/server/session';

export default async function AdminHomePage() {
  const session = await getSession('admin');
  if (session.status !== 'ok') redirect('/admin/entrar');
  return <AdminHome />;
}
