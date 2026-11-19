import type { Metadata } from 'next';
import { CommissionsPage } from '@/features/admin-finance/commissions-page';

export const metadata: Metadata = { title: 'Comissões' };

export default function Page() {
  return <CommissionsPage />;
}
