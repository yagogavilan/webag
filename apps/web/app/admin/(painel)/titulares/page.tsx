import type { Metadata } from 'next';
import { PrivacyRequestsPage } from '@/features/privacy/requests-page';

export const metadata: Metadata = { title: 'Pedidos de titulares' };

export default function Page() {
  return <PrivacyRequestsPage />;
}
