#!/usr/bin/env node
// Gera as imagens do S9 (BUG-010) em ./imagens-s9/ (não commitar): PNG 25 MP (teto do PNG), PNG 39,7 MP (acima do teto, deve ser recusado) e JPEG 39,9 MP.
// Usa o `sharp` do repositório. Uso: node docs/qa/carga/s9-gerar-imagens.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const sharp = createRequire(new URL('../../../apps/api/package.json', import.meta.url))('sharp');
const dir = new URL('./imagens-s9/', import.meta.url);
mkdirSync(dir, { recursive: true });
const flat = (w, h, bg) => sharp({ create: { width: w, height: h, channels: 3, background: bg } });
writeFileSync(new URL('png25.png', dir), await flat(5000, 5000, { r: 200, g: 30, b: 60 }).png({ compressionLevel: 9 }).toBuffer());
writeFileSync(new URL('png40.png', dir), await flat(6300, 6300, { r: 20, g: 90, b: 160 }).png({ compressionLevel: 9 }).toBuffer());
writeFileSync(new URL('jpeg40.jpg', dir), await flat(7000, 5700, { r: 30, g: 120, b: 200 }).jpeg({ quality: 60 }).toBuffer());
console.log('imagens geradas em', dir.pathname);
