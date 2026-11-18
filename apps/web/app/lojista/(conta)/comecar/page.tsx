import type { Metadata } from 'next';
import { StartStore } from '@/features/lojista/start-store';
import { getSession } from '@/server/session';

export const metadata: Metadata = { title: 'Cadastrar minha loja' };

export default async function Page() {
  const session = await getSession('lojista');
  if (session.status !== 'ok') return null; // o layout do grupo já redireciona; isto só estreita o tipo
  return <StartStore email={session.user.email} emailVerified={session.user.emailVerified} />;
}
