import type { Metadata } from 'next';
import { EditorPage } from '@/features/legal/editor-page';

export const metadata: Metadata = { title: 'Nova versão' };

export default async function Page({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  return <EditorPage slug={tipo} />;
}
