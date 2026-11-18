import type { Metadata } from 'next';
import { QueuePage } from '@/features/stores/queue-page';

export const metadata: Metadata = { title: 'Fila de aprovação' };

export default function Page() {
  return <QueuePage />;
}
