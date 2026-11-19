import type { Metadata } from 'next';
import { LegalPage } from '@/components/public/legal-page';
import { loadLegal } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description: 'Como o Webag trata os seus dados pessoais, quais direitos você tem e como falar com o encarregado.',
  alternates: { canonical: '/privacidade' },
};

export default async function Page() {
  return <LegalPage loaded={await loadLegal('privacy')} fallbackTitle="Política de privacidade" testId="public.privacidade" />;
}
