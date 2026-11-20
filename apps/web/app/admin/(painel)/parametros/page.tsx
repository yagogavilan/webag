import type { Metadata } from 'next';
import { ParametersPage } from '@/features/parameters/parameters-page';

export const metadata: Metadata = { title: 'Parâmetros' };

export default function Page() {
  return <ParametersPage />;
}
