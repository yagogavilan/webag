import type { Metadata } from 'next';
import { NotificationsPage } from '@/features/loja/notifications-page';

export const metadata: Metadata = { title: 'Avisos de pedido novo' };

export default function Page() {
  return <NotificationsPage />;
}
