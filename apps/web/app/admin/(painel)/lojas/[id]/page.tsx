import type { Metadata } from 'next';
import { StoreCasePage } from '@/features/stores/store-case-page';
import { isStoreTab } from '@/features/stores/store-detail';

export const metadata: Metadata = { title: 'Loja' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { id } = await params;
  const { aba } = await searchParams;
  return <StoreCasePage storeId={id} tab={isStoreTab(aba) ? aba : undefined} />;
}
