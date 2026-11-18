import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pacotes do workspace publicados como TypeScript (sem build próprio).
  transpilePackages: ['@webag/tokens'],
  // Imagem de produção enxuta (Dockerfile do web entra com o guia de deploy).
  output: 'standalone',
  typedRoutes: true,
  async headers() {
    // CSP com nonce é montada no proxy.ts (só /admin). Aqui, o que vale para todas as rotas.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
