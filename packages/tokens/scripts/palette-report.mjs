#!/usr/bin/env node
// Relatorio de contraste (WCAG 2.2 AA) para cores candidatas da marca. Nao altera nenhum arquivo.
// Uso: pnpm --filter @webag/tokens palette "#RRGGBB" ["#RRGGBB" ...]   (aspas por causa do #)
// Serve para decidir o papel de cada cor extraida da logo ANTES de montar theme/<nome>.json.
// A sugestao de versao escura e so um ponto de partida: ajuste a escala a mao e rode `check`.
import { get, loadResolved } from './lib.mjs';

const candidates = process.argv.slice(2).filter((arg) => arg !== '--');
if (candidates.length === 0) {
  console.error('Uso: pnpm --filter @webag/tokens palette "#RRGGBB" ["#RRGGBB" ...]');
  process.exit(2);
}

const tokens = loadResolved();
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t);

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

const white = toRgb(get(tokens, 'color.neutral.0'));
const ink = toRgb(get(tokens, 'color.neutral.900'));
const surfaces = ['color.neutral.0', 'color.neutral.50', 'color.neutral.100'].map((path) => toRgb(get(tokens, path)));
const worst = (rgb) => Math.min(...surfaces.map((surface) => ratio(rgb, surface)));

const line = (label, value, min) =>
  console.log(`  ${value >= min ? 'OK   ' : 'FALHA'} ${value.toFixed(2).padStart(5)}:1  min ${min}  ${label}`);

for (const hex of candidates) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    console.error(`Cor invalida: ${hex} (use #RRGGBB)`);
    process.exit(2);
  }
  const rgb = toRgb(hex);
  console.log(`\n${hex.toUpperCase()}`);
  line('botao ou fundo amplo com texto BRANCO', ratio(white, rgb), 4.5);
  line('botao ou fundo amplo com texto ESCURO (neutral.900)', ratio(ink, rgb), 4.5);
  line('texto ou link da cor sobre cartao, tela e rebaixado (pior caso)', worst(rgb), 4.5);
  line('icone, borda e anel de foco sobre cartao, tela e rebaixado (pior caso)', worst(rgb), 3);

  let dark = null;
  for (let step = 0; step <= 50; step += 1) {
    const candidate = mix(rgb, [0, 0, 0], step / 50);
    if (ratio(white, candidate) >= 4.5 && worst(candidate) >= 4.5) {
      dark = candidate;
      break;
    }
  }
  console.log(`  versao escura sugerida (texto e botao com branco): ${dark ? toHex(dark) : 'nenhuma'}`);
  console.log(`  tom suave sugerido (fundo de chip e selo): ${toHex(mix(rgb, white, 0.9))}`);
}
