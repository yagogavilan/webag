import type { Metadata } from 'next';
import { NewProductEntry } from '@/features/catalog/quick/new-entry';

export const metadata: Metadata = { title: 'Novo produto' };

export default function Page() {
  return <NewProductEntry />;
}
