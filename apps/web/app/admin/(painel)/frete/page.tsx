import type { Metadata } from 'next';
import { FeeTablesPage } from '@/features/admin-finance/fee-tables-page';

export const metadata: Metadata = { title: 'Frete por região' };

export default function Page() {
  return <FeeTablesPage />;
}
