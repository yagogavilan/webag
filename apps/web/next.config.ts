import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `NEXT_DIST_DIR`: build separado quando outro `next start` usa o `.next` padrão (ex.: E2E ao lado do QA).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // Pacotes do workspace publicados como TypeScript (sem build próprio).
  transpilePackages: ['@webag/tokens'],
  // Imagem de produção enxuta (Dockerfile do web entra com o guia de deploy).
  output: 'standalone',
  typedRoutes: true,
  // Só em desenvolvimento e só quando `pnpm iphone` define o endereço do computador na rede local: libera o acesso pelo IP (iPhone no Safari).
  ...(process.env.WEBAG_DEV_HOST ? { allowedDevOrigins: [process.env.WEBAG_DEV_HOST] } : {}),
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
