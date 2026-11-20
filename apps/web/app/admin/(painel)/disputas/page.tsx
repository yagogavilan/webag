import type { Metadata } from 'next';
import { DisputesPage } from '@/features/disputes/disputes-page';

export const metadata: Metadata = { title: 'Disputas de troca' };

export default function Page() {
  return <DisputesPage />;
}
