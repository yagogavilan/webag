import type { Metadata } from 'next';
import { ExchangesReportPage } from '@/features/admin-finance/exchanges-report-page';

export const metadata: Metadata = { title: 'Relatório de trocas' };

export default function Page() {
  return <ExchangesReportPage />;
}
