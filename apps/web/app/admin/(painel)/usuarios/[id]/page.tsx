import type { Metadata } from 'next';
import { UserDetailPage } from '@/features/admin-ops/user-detail-page';

export const metadata: Metadata = { title: 'Usuário' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetailPage id={id} />;
}
