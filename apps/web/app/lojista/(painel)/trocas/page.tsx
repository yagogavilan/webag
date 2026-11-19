import type { Metadata } from 'next';
import { ExchangesPage } from '@/features/exchanges/exchanges-page';

export const metadata: Metadata = { title: 'Trocas' };

export default function Page() {
  return <ExchangesPage />;
}
