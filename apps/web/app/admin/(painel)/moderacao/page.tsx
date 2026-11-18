import type { Metadata } from 'next';
import { ModerationPage } from '@/features/stores/moderation-page';

export const metadata: Metadata = { title: 'Moderação de produtos' };

export default function Page() {
  return <ModerationPage />;
}
