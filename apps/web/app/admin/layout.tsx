import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Origem própria do admin: o título da aba é fixo (anti página falsa, onda-1b §0.6) e nada é pré-renderizado
// estaticamente (cookie de sessão e CSP com nonce dependem de cada requisição).
export const metadata: Metadata = { title: { default: 'Webag Admin', template: '%s | Webag Admin' } };
export const dynamic = 'force-dynamic';

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
