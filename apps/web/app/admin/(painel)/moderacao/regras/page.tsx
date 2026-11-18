import type { Metadata } from 'next';
import { ModerationRulesPage } from '@/features/stores/moderation-rules-page';

export const metadata: Metadata = { title: 'Regras de moderação' };

export default function Page() {
  return <ModerationRulesPage />;
}
