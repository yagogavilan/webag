import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pacotes do workspace publicados como TypeScript (sem build próprio).
  transpilePackages: ['@webag/tokens'],
  // Imagem de produção enxuta (Dockerfile do web entra com o guia de deploy).
  output: 'standalone',
  typedRoutes: true,
};

export default nextConfig;
