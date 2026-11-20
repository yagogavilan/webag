import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PublicShell } from '@/components/public/public-shell';
import { publicOrigin } from '@/server/config';
import { publicAllowedOnHost } from '@/server/hosts';
import { loadMaintenance } from '@/server/public-content';

/** Site público (sem login): só no `PUBLIC_HOST`, indexável, com CSP própria montada no proxy (nonce por requisição, por isso dinâmico). */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  robots: { index: true, follow: true },
  openGraph: { siteName: 'Webag', locale: 'pt_BR', type: 'website' },
};

export default async function PublicLayout({ children }: { children: ReactNode }) {
  if (!publicAllowedOnHost(await headers())) notFound();
  const maintenance = await loadMaintenance();
  return <PublicShell maintenance={maintenance}>{children}</PublicShell>;
}
