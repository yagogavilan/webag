import type { Metadata } from 'next';
import { ViewAsPage, isViewAsTab } from '@/features/view-as/view-as-page';

export const metadata: Metadata = { title: 'Ver como o lojista' };
// A visão é por sessão do admin: nunca estática nem em cache.
export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { id } = await params;
  const { aba } = await searchParams;
  return <ViewAsPage storeId={id} tab={isViewAsTab(aba) ? aba : 'ped'} />;
}
