import type { Metadata } from 'next';
import { RefundQueuePage } from '@/features/admin-finance/refund-queue-page';

export const metadata: Metadata = { title: 'Estornos pendentes' };

export default function Page() {
  return <RefundQueuePage />;
}
