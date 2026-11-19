import type { Metadata } from 'next';
import { HistoryPage } from '@/features/orders/history-page';

export const metadata: Metadata = { title: 'Histórico de pedidos' };

export default function Page() {
  return <HistoryPage />;
}
