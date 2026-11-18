import type { Metadata } from 'next';
import { ImportPage } from '@/features/catalog/import-page';

export const metadata: Metadata = { title: 'Importar planilha' };

export default function Page() {
  return <ImportPage />;
}
