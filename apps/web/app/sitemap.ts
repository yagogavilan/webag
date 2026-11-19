import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { publicOrigin } from '@/server/config';
import { publicAllowedOnHost } from '@/server/hosts';

export const dynamic = 'force-dynamic';

const PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/privacidade', priority: 0.8 },
  { path: '/termos', priority: 0.8 },
  { path: '/termos/lojista', priority: 0.5 },
  { path: '/ajuda', priority: 0.7 },
  { path: '/suporte', priority: 0.7 },
  { path: '/excluir-conta', priority: 0.6 },
  { path: '/licencas', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!publicAllowedOnHost(await headers())) return [];
  const origin = publicOrigin();
  return PAGES.map(({ path, priority }) => ({ url: `${origin}${path === '/' ? '' : path}`, priority }));
}
