import type { Metadata } from 'next';
import { LogisticsPage } from '@/features/logistics/logistics-page';

export const metadata: Metadata = { title: 'Logística' };

export default function Page() {
  return <LogisticsPage />;
}
