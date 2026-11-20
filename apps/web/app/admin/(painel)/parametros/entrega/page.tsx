import type { Metadata } from 'next';
import { DeliveryParametersPage } from '@/features/parameters/delivery-params-page';

export const metadata: Metadata = { title: 'Parâmetros de entrega' };

export default function Page() {
  return <DeliveryParametersPage />;
}
