import type { Metadata } from 'next';
import { RegionsPage } from '@/features/regions/regions-page';

export const metadata: Metadata = { title: 'Regiões' };

export default function Page() {
  return <RegionsPage />;
}
