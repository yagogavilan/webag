import type { Metadata } from 'next';
import { ProductFormPage } from '@/features/catalog/product-form';

export const metadata: Metadata = { title: 'Novo produto' };

export default function Page() {
  return <ProductFormPage />;
}
