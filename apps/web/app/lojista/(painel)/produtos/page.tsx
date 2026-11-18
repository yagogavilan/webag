import type { Metadata } from 'next';
import { ProductsPage } from '@/features/catalog/products-page';

export const metadata: Metadata = { title: 'Produtos' };

export default function Page() {
  return <ProductsPage />;
}
