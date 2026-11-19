import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@webag/tokens/css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Webag', template: '%s | Webag' },
  // Painéis internos: fora de buscadores.
  robots: { index: false, follow: false },
  icons: { icon: '/brand/webag-favicon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
