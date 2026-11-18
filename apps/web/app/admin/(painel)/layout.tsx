import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/panel/admin-shell';
import { getSession } from '@/server/session';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const session = await getSession('admin');
  if (session.status === 'anonymous') redirect('/admin/entrar');
  if (session.status === 'mfa_setup') redirect('/admin/verificacao');
  return <AdminShell user={session.user}>{children}</AdminShell>;
}
