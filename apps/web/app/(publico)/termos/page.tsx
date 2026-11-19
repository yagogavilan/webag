import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/public/legal-page';
import { loadLegal } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Termos de uso',
  description: 'Regras de uso do aplicativo Webag para clientes.',
  alternates: { canonical: '/termos' },
};

export default async function Page() {
  return (
    <>
      <LegalPage loaded={await loadLegal('customer_terms')} fallbackTitle="Termos de uso" testId="public.termos" />
      <p style={{ textAlign: 'center', margin: '0 0 var(--wb-space-8)' }} className="wb-text-body">
        Tem uma loja no Webag? Leia os <Link href="/termos/lojista">Termos do lojista</Link>.
      </p>
    </>
  );
}
