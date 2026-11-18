import type { Metadata } from 'next';
import { CorrectionPage } from '@/features/lojista/correction-page';

export const metadata: Metadata = { title: 'Correção do cadastro' };

export default function Page() {
  return <CorrectionPage />;
}
