import type { Metadata } from 'next';
import { HelpAdminPage } from '@/features/content/help-page';

export const metadata: Metadata = { title: 'Ajuda' };

export default function Page() {
  return <HelpAdminPage />;
}
