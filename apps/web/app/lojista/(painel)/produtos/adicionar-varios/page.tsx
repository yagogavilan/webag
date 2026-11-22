import type { Metadata } from 'next';
import { PastePage } from '@/features/catalog/quick/paste-page';

export const metadata: Metadata = { title: 'Adicionar vários produtos' };

export default function Page() {
  return <PastePage />;
}
