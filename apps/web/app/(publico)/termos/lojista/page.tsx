import type { Metadata } from 'next';
import { LegalPage } from '@/components/public/legal-page';
import { loadLegal } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Termos do lojista',
  description: 'Regras de uso do Webag para quem vende no aplicativo.',
  alternates: { canonical: '/termos/lojista' },
};

export default async function Page() {
  return <LegalPage loaded={await loadLegal('merchant_terms')} fallbackTitle="Termos do lojista" testId="public.termos-lojista" />;
}
