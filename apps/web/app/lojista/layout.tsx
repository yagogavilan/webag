import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PANEL_AREAS } from '@/lib/areas';

// Cookie de sessão e CSP com nonce dependem de cada requisição: nada é pré-renderizado estaticamente.
export const metadata: Metadata = { title: { default: PANEL_AREAS.lojista.title, template: '%s | Painel da loja' } };
export const dynamic = 'force-dynamic';

export default function LojistaRootLayout({ children }: { children: ReactNode }) {
  return children;
}
