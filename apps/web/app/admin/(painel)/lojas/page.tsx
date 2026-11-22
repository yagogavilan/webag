import type { Metadata } from 'next';
import type { AllStoresFilters } from '@/features/stores/all-stores';
import { QueuePage } from '@/features/stores/queue-page';

export const metadata: Metadata = { title: 'Lojas' };

type Search = { aba?: string; q?: string; situacao?: string; semproduto?: string; propria?: string };
const SITUATIONS = ['approved', 'in_review', 'suspended'] as const;

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const { aba, q, situacao, semproduto, propria } = await searchParams;
  const tab = aba === 'todas' ? 'all' : aba === 'aguardando' ? 'waiting' : 'pending';
  const initialFilters: AllStoresFilters = {
    q: (q ?? '').slice(0, 80),
    situation: (SITUATIONS as readonly string[]).includes(situacao ?? '') ? (situacao as (typeof SITUATIONS)[number]) : 'all',
    noProduct: semproduto === '1',
    ownCommission: propria === '1',
  };
  return <QueuePage initialTab={tab} initialFilters={initialFilters} />;
}
