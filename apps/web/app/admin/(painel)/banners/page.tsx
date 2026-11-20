import type { Metadata } from 'next';
import { BannersPage } from '@/features/marketing/banners-page';

export const metadata: Metadata = { title: 'Banners e destaques' };

export default function Page() {
  return <BannersPage />;
}
