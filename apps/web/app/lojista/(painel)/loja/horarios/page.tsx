import type { Metadata } from 'next';
import { HoursPage } from '@/features/loja/hours-page';

export const metadata: Metadata = { title: 'Horários e pausa' };

export default function Page() {
  return <HoursPage />;
}
