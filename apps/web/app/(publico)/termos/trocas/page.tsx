import type { Metadata } from 'next';
import { LegalLinks } from '@/components/public/legal-links';
import { LegalPage } from '@/components/public/legal-page';
import { loadLegalView } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Política de trocas e reembolsos',
  description: 'Como funcionam o arrependimento, o produto com defeito, a troca por tamanho ou cor e o reembolso no Webag.',
  alternates: { canonical: '/termos/trocas' },
};

export default async function Page() {
  return <LegalPage {...await loadLegalView('exchange_policy')} fallbackTitle="Política de trocas e reembolsos" testId="public.trocas" footer={<LegalLinks current="exchange" />} />;
}
