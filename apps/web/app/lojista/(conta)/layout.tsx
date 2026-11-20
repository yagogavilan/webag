import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { getSession } from '@/server/session';

/** Conta já aberta, mas ainda sem o papel de lojista (cliente que vai abrir a loja, ou cadastro interrompido). */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await getSession('lojista');
  if (session.status !== 'ok') redirect('/lojista/entrar');
  if (session.user.roles.includes('merchant')) redirect('/lojista');
  return <ToastProvider>{children}</ToastProvider>;
}
