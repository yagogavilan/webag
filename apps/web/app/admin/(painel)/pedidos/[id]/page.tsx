import type { Metadata } from 'next';
import { AdminOrderDetailPage } from '@/features/admin-ops/order-detail-page';

export const metadata: Metadata = { title: 'Pedido' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminOrderDetailPage id={id} />;
}
