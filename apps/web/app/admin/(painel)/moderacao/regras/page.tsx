import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModerationRulesPage } from '@/features/stores/moderation-rules-page';
import { MODERATION_READY } from '@/lib/api/admin-moderation';

export const metadata: Metadata = { title: 'Regras de moderação' };

export default function Page() {
  if (!MODERATION_READY) notFound();
  return <ModerationRulesPage />;
}
