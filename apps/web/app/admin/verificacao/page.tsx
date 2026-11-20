import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TotpSetup } from '@/features/auth/totp-setup';
import { getSession } from '@/server/session';

export const metadata: Metadata = { title: 'Verificação em duas etapas' };

export default async function Page() {
  const session = await getSession('admin');
  if (session.status === 'anonymous') redirect('/admin/entrar');
  if (session.status === 'ok') redirect('/admin');
  return <TotpSetup />;
}
