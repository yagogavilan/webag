import type { Metadata } from 'next';
import { ExchangePage } from '@/features/loja/exchange-page';

export const metadata: Metadata = { title: 'Política de trocas' };

export default function Page() {
  return <ExchangePage />;
}
