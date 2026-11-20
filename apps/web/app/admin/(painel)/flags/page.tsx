import type { Metadata } from 'next';
import { FlagsPage } from '@/features/flags/flags-page';

export const metadata: Metadata = { title: 'Feature flags' };

export default function Page() {
  return <FlagsPage />;
}
