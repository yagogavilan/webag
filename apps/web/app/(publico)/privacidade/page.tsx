import type { Metadata } from 'next';
import { LegalLinks } from '@/components/public/legal-links';
import { LegalPage } from '@/components/public/legal-page';
import { loadLegalView } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description: 'Como o Webag trata os seus dados pessoais, quais direitos você tem e como falar com o encarregado.',
  alternates: { canonical: '/privacidade' },
};

export default async function Page() {
  return <LegalPage {...await loadLegalView('privacy')} fallbackTitle="Política de privacidade" testId="public.privacidade" footer={<LegalLinks current="privacy" />} />;
}
