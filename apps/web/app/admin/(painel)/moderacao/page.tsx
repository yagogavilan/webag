import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModerationPage } from '@/features/stores/moderation-page';
import { MODERATION_READY } from '@/lib/api/admin-moderation';

export const metadata: Metadata = { title: 'Moderação de produtos' };

export default function Page() {
  if (!MODERATION_READY) notFound();
  return <ModerationPage />;
}
