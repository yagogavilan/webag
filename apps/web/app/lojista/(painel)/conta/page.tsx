import type { Metadata } from 'next';
import { MerchantAccountPage } from '@/features/account/account-page';

export const metadata: Metadata = { title: 'Minha conta' };

export default function Page() {
  return <MerchantAccountPage />;
}
