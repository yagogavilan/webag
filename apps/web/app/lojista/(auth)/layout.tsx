import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { getSession } from '@/server/session';

/** Telas de acesso: quem já tem sessão vai direto ao painel (a home decide o próximo passo). */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession('lojista');
  if (session.status === 'ok') redirect('/lojista');
  // O código por e-mail e outras telas de acesso avisam por toast; sem o provedor a tela cai (achado no E2E).
  return <ToastProvider>{children}</ToastProvider>;
}
