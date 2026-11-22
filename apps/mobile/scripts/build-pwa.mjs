#!/usr/bin/env node
// Gera os arquivos de "app na tela de início" do navegador (PWA mínimo, `pnpm iphone` / Safari > Adicionar à Tela de Início) em public/:
// ícones a partir de assets/icon.png (símbolo da marca v4a, já aprovado) e manifest.json com as cores dos tokens (packages/tokens).
// Uso: pnpm --filter @webag/mobile assets:pwa   (o resultado é versionado; só rode de novo se o ícone ou as cores mudarem)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const tokensDir = resolve(app, '../../packages/tokens');
const theme = JSON.parse(readFileSync(resolve(tokensDir, 'tokens.json'), 'utf8')).$theme;
const color = JSON.parse(readFileSync(resolve(tokensDir, 'theme', `${theme}.json`), 'utf8')).color;
const brand = color.brand['500'];
const background = color.neutral['50'];
if (!/^#[0-9a-f]{6}$/i.test(brand) || !/^#[0-9a-f]{6}$/i.test(background)) throw new Error('cores dos tokens em formato inesperado');

const out = resolve(app, 'public');
mkdirSync(out, { recursive: true });
const source = resolve(app, 'assets/icon.png'); // 1024x1024, sem transparência

for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon.png', 48]]) {
  await sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(out, file));
}

writeFileSync(
  resolve(out, 'manifest.json'),
  JSON.stringify(
    {
      name: 'Webag',
      short_name: 'Webag',
      description: 'Compras da sua região, entregues ou para retirar.',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: brand,
      background_color: background,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(`public/ gerado (tema ${theme}, marca ${brand}, fundo ${background})`);
