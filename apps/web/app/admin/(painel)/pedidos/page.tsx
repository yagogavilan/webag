import type { Metadata } from 'next';
import { AdminOrdersPage } from '@/features/admin-ops/orders-page';

export const metadata: Metadata = { title: 'Pedidos' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: string | string[] | undefined) => (typeof value === 'string' && UUID.test(value) ? value : undefined);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <AdminOrdersPage initialUserId={uuid(params.userId)} initialStoreId={uuid(params.storeId)} />;
}
