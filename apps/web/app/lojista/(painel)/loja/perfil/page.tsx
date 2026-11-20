import type { Metadata } from 'next';
import { ProfilePage } from '@/features/loja/profile-page';

export const metadata: Metadata = { title: 'Perfil da loja' };

export default function Page() {
  return <ProfilePage />;
}
