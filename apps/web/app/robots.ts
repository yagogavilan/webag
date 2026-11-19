import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { publicOrigin } from '@/server/config';
import { publicAllowedOnHost } from '@/server/hosts';

export const dynamic = 'force-dynamic';

/** Só o host público é indexável; nos hosts dos painéis o robots proíbe tudo. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!publicAllowedOnHost(await headers())) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/lojista', '/pagar', '/api'] },
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
