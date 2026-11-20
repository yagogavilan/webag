import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CardPay, IntentProblem } from '@/features/card-pay/card-pay';
import { appScheme } from '@/server/config';
import { loadCardIntent } from '@/server/card-intent';
import { publicAllowedOnHost } from '@/server/hosts';

export const metadata: Metadata = { title: 'Pagar com cartão', referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/**
 * Página pública de cartão (B.2, SEC-106): sem login do painel, no host público. O app abre `?i=<token>` no navegador do sistema;
 * o token é a credencial (uso único, 15 min). O formulário é o Brick do Mercado Pago: o Webag nunca recebe dado de cartão.
 */
export default async function CardPage({ searchParams }: { searchParams: Promise<{ i?: string | string[] }> }) {
  const requestHeaders = await headers();
  if (!publicAllowedOnHost(requestHeaders)) notFound();
  const { i } = await searchParams;
  const token = Array.isArray(i) ? i[0] : i;
  const scheme = appScheme();
  const loaded = await loadCardIntent(token, requestHeaders);
  if (!loaded.ok) return <IntentProblem reason={loaded.reason} scheme={scheme} />;
  return <CardPay intent={token!} view={loaded.view} scheme={scheme} />;
}
