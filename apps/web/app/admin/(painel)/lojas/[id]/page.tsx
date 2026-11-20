import type { Metadata } from 'next';
import { StoreCasePage } from '@/features/stores/store-case-page';

export const metadata: Metadata = { title: 'Loja' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoreCasePage storeId={id} />;
}
