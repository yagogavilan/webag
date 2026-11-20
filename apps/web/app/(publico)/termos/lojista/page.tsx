import type { Metadata } from 'next';
import { LegalLinks } from '@/components/public/legal-links';
import { LegalPage } from '@/components/public/legal-page';
import { loadLegalView } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Termos do lojista',
  description: 'Regras de uso do Webag para quem vende no aplicativo.',
  alternates: { canonical: '/termos/lojista' },
};

export default async function Page() {
  return <LegalPage {...await loadLegalView('merchant_terms')} fallbackTitle="Termos do lojista" testId="public.termos-lojista" footer={<LegalLinks current="merchant" />} />;
}
