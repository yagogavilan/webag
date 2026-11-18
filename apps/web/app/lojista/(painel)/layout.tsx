import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LojistaShell } from '@/components/panel/lojista-shell';
import { asRoute } from '@/lib/routes';
import { getSession } from '@/server/session';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const session = await getSession('lojista');
  if (session.status !== 'ok') redirect('/lojista/entrar');
  if (!session.user.roles.includes('merchant')) redirect(asRoute('/lojista/comecar'));
  return <LojistaShell user={session.user}>{children}</LojistaShell>;
}
