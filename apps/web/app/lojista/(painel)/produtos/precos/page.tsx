import type { Metadata } from 'next';
import { PriceTablePage } from '@/features/catalog/quick/price-table';

export const metadata: Metadata = { title: 'Preços e estoque' };

export default function Page() {
  return <PriceTablePage />;
}
