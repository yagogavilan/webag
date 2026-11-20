import type { Metadata } from 'next';
import { VersionsPage } from '@/features/legal/versions-page';

export const metadata: Metadata = { title: 'Versões' };

export default async function Page({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  return <VersionsPage slug={tipo} />;
}
