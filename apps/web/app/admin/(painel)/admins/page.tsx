import type { Metadata } from 'next';
import { AdminsPage } from '@/features/admins/admins-page';

export const metadata: Metadata = { title: 'Admins e perfis' };

export default function Page() {
  return <AdminsPage />;
}
