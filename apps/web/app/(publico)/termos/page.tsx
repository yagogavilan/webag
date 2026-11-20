import type { Metadata } from 'next';
import { LegalLinks } from '@/components/public/legal-links';
import { LegalPage } from '@/components/public/legal-page';
import { loadLegalView } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Termos de uso',
  description: 'Regras de uso do aplicativo Webag para clientes.',
  alternates: { canonical: '/termos' },
};

export default async function Page() {
  return <LegalPage {...await loadLegalView('customer_terms')} fallbackTitle="Termos de uso" testId="public.termos" footer={<LegalLinks current="customer" />} />;
}
