import type { Metadata } from 'next';
import { ContentReportsPage } from '@/features/content/reports-page';

export const metadata: Metadata = { title: 'Denúncias' };

export default function Page() {
  return <ContentReportsPage />;
}
