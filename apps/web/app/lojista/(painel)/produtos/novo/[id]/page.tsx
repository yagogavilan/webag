import type { Metadata } from 'next';
import { QuickProductPage } from '@/features/catalog/quick/quick-form';

export const metadata: Metadata = { title: 'Novo produto' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ camera?: string }> }) {
  const { id } = await params;
  const { camera } = await searchParams;
  return <QuickProductPage productId={id} autoCamera={camera === '1'} />;
}
