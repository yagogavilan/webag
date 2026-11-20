import type { Metadata } from 'next';
import { ExchangeCasePage } from '@/features/disputes/exchange-case-page';

export const metadata: Metadata = { title: 'Troca' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExchangeCasePage id={id} />;
}
