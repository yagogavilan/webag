import type { Metadata } from 'next';
import { ExchangeDetailPage } from '@/features/exchanges/exchange-detail-page';

export const metadata: Metadata = { title: 'Troca' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExchangeDetailPage id={id} />;
}
