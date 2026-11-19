import type { Metadata } from 'next';
import { CouponsPage } from '@/features/marketing/coupons-page';

export const metadata: Metadata = { title: 'Cupons da plataforma' };

export default function Page() {
  return <CouponsPage />;
}
