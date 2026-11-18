#!/usr/bin/env node
// Verifica os pares de contraste de a11y/contrast-pairs.json contra tokens.json (WCAG 2.2 AA).
// Falha (exit 1) se algum par ficar abaixo do minimo. Avisa se a razao divergir do valor documentado.
// Uso: pnpm --filter @webag/tokens check
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get, loadResolved, root } from './lib.mjs';

const tokens = loadResolved();
const pairs = JSON.parse(readFileSync(resolve(root, 'a11y/contrast-pairs.json'), 'utf8'));

function parseColor(text) {
  const value = text.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return { rgb, alpha: 1 };
  }
  const match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!match) throw new Error(`Cor nao suportada: ${text}`);
  const parts = match[1].split(',').map((part) => parseFloat(part.trim()));
  return { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 };
}

// Compoe uma cor (possivelmente translucida) sobre um fundo opaco.
function flatten(color, backdropRgb) {
  return color.rgb.map((channel, i) => channel * color.alpha + backdropRgb[i] * (1 - color.alpha));
}

// Luminancia relativa (sRGB, WCAG 2.x).
function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(rgbA, rgbB) {
  const [light, dark] = [luminance(rgbA), luminance(rgbB)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

let failures = 0;
let warnings = 0;

for (const pair of pairs) {
  const overRgb = parseColor(get(tokens, pair.over ?? 'color.neutral.0')).rgb;
  const bg = flatten(parseColor(get(tokens, pair.bg)), overRgb);
  const fg = flatten(parseColor(get(tokens, pair.fg)), bg);
  const value = ratio(fg, bg);
  const ok = value >= pair.min;
  const drift = pair.expected !== undefined && Math.abs(value - pair.expected) > 0.15;
  if (!ok) failures += 1;
  if (drift) warnings += 1;
  const status = ok ? 'OK   ' : 'FALHA';
  const note = drift ? `  (documentado ${pair.expected}; revisar docs)` : '';
  console.log(`${status} ${value.toFixed(2).padStart(5)}:1  min ${pair.min}  ${pair.id}${note}`);
}

console.log(`\n${pairs.length} pares, ${failures} falha(s), ${warnings} divergencia(s) de documentacao.`);
process.exit(failures > 0 ? 1 : 0);
