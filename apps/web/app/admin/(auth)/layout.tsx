import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '@/server/session';

/** Telas de acesso: quem já tem sessão vai direto ao painel (ou à configuração do 2º fator). */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession('admin');
  if (session.status === 'ok') redirect('/admin');
  if (session.status === 'mfa_setup') redirect('/admin/verificacao');
  return children;
}
