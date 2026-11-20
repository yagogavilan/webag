import type { Metadata } from 'next';
import { ProductsPage } from '@/features/catalog/products-page';
import type { ProductFilter } from '@/lib/api/catalog';

export const metadata: Metadata = { title: 'Produtos' };

const FILTERS: readonly ProductFilter[] = ['all', 'active', 'paused', 'low', 'draft'];

export default async function Page({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro } = await searchParams;
  const initial = FILTERS.find((item) => item === filtro) ?? 'all';
  return <ProductsPage initialFilter={initial} />;
}
