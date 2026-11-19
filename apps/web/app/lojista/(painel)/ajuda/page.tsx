import type { Metadata } from 'next';
import { MerchantHelpPage } from '@/features/help/merchant-help-page';

export const metadata: Metadata = { title: 'Ajuda' };

export default function Page() {
  return <MerchantHelpPage />;
}
