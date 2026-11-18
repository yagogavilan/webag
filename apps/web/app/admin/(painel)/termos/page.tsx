import type { Metadata } from 'next';
import { TermsPage } from '@/features/legal/terms-page';

export const metadata: Metadata = { title: 'Termos e privacidade' };

export default function Page() {
  return <TermsPage />;
}
