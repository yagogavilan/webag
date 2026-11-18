import type { Metadata } from 'next';
import { DeliveryPage } from '@/features/loja/delivery-page';

export const metadata: Metadata = { title: 'Entrega e retirada' };

export default function Page() {
  return <DeliveryPage />;
}
