import type { Metadata } from 'next';
import { AlertDetailPage } from '@/features/admin-ops/alert-detail-page';

export const metadata: Metadata = { title: 'Alerta' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AlertDetailPage id={id} />;
}
