import type { Metadata } from 'next';
import { PushPage } from '@/features/marketing/push-page';

export const metadata: Metadata = { title: 'Push segmentado' };

export default function Page() {
  return <PushPage />;
}
