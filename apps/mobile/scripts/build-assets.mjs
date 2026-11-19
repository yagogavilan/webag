// Gera icon, adaptive-icon, monocromático e splash do app a partir do símbolo v4a (docs/design/logo) e da cor de marca do tema.
// Uso: pnpm --filter @webag/mobile assets
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets');
mkdirSync(out, { recursive: true });
const tokensDir = join(here, '..', '..', '..', 'packages', 'tokens');
const themeName = JSON.parse(readFileSync(join(tokensDir, 'tokens.json'), 'utf8')).$theme;
const brand = JSON.parse(readFileSync(join(tokensDir, 'theme', `${themeName}.json`), 'utf8')).color.brand['500'];

const symbol = (fill) => `
  <defs><mask id="wb-olhais" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="104">
    <rect x="0" y="0" width="160" height="104" fill="#FFFFFF"/>
    <circle cx="80" cy="52" r="4.5" fill="#000000"/><circle cx="132" cy="52" r="4.5" fill="#000000"/></mask></defs>
  <g transform="translate(249.6 337.6) scale(3.2)">
    <g fill="${fill}"><rect x="24" y="34" width="23" height="14" rx="7"/><rect x="0" y="62" width="49" height="14" rx="7"/><rect x="18" y="90" width="34" height="14" rx="7"/></g>
    <g fill="${fill}" mask="url(#wb-olhais)"><polygon points="67,43 145,43 133,95 72,95" stroke="${fill}" stroke-width="18" stroke-linejoin="round"/>
      <path d="M80 42 A26 30 0 0 1 132 42" fill="none" stroke="${fill}" stroke-width="14"/></g>
  </g>`;
const svg = (inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${inner}</svg>`);

const jobs = {
  // iOS: opaco, a Apple arredonda os cantos.
  'icon.png': svg(`<rect width="1024" height="1024" fill="${brand}"/>${symbol('#FFFFFF')}`),
  // Android adaptativo: camada da frente transparente (o fundo é a cor de marca no app.config).
  'adaptive-icon.png': svg(symbol('#FFFFFF')),
  // Android 13 monocromático: uma cor, olhais vazados.
  'adaptive-monochrome.png': svg(symbol('#000000')),
  // Splash: símbolo branco sobre fundo transparente (o fundo é a cor de marca no plugin).
  'splash-icon.png': svg(symbol('#FFFFFF')),
};
for (const [name, buf] of Object.entries(jobs)) {
  const img = sharp(buf);
  // iOS não aceita ícone com canal alfa.
  await (name === 'icon.png' ? img.flatten({ background: brand }).removeAlpha() : img).png().toFile(join(out, name));
  console.log('gerado', name);
}
