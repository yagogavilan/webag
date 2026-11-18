import type { Metadata } from 'next';
import { SectionsPage } from '@/features/catalog/sections-page';

export const metadata: Metadata = { title: 'Seções da vitrine' };

export default function Page() {
  return <SectionsPage />;
}
