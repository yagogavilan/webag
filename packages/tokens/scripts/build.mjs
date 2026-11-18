#!/usr/bin/env node
// Gera src/tokens.ts (React Native / TypeScript) e css/tokens.css (web) a partir de tokens.json.
// Uso: pnpm --filter @webag/tokens build
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadResolved, root } from './lib.mjs';

const tokens = loadResolved();

// Grupos que nao viram variavel CSS (so existem no React Native ou sao gerados a parte).
const CSS_SKIP = new Set(['native', 'textStyle']);
const PX_GROUPS = new Set(['space', 'size', 'radius', 'borderWidth', 'breakpoint', 'layout']);

const kebab = (text) => text.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function withUnit(path, value) {
  if (typeof value !== 'number') return String(value);
  const [group, sub] = path;
  if (PX_GROUPS.has(group)) return `${value}px`;
  if (group === 'font' && (sub === 'size' || sub === 'lineHeight')) return `${value}px`;
  if (group === 'motion' && sub === 'duration') return `${value}ms`;
  return String(value);
}

function flatten(node, path = [], out = []) {
  for (const [key, value] of Object.entries(node)) {
    if (path.length === 0 && CSS_SKIP.has(key)) continue;
    const next = [...path, key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, next, out);
    } else {
      out.push([next, value]);
    }
  }
  return out;
}

// ---------- TypeScript ----------
const ts = [
  '// GERADO por scripts/build.mjs a partir de tokens.json. Nao edite a mao.',
  '// Regerar: pnpm --filter @webag/tokens build',
  `export const tokens = ${JSON.stringify(tokens, null, 2)} as const;`,
  '',
  'export type Tokens = typeof tokens;',
  '',
].join('\n');

// ---------- CSS ----------
const variables = flatten(tokens)
  .map(([path, value]) => `  --wb-${path.map(kebab).join('-')}: ${withUnit(path, value)};`)
  .join('\n');

const textClasses = Object.entries(tokens.textStyle)
  .map(([name, style]) => {
    const lines = [
      `  font-size: ${style.size}px;`,
      `  line-height: ${style.lineHeight}px;`,
      `  font-weight: ${style.weight};`,
    ];
    if (style.tabular) lines.push('  font-variant-numeric: tabular-nums;');
    return `.wb-text-${kebab(name)} {\n${lines.join('\n')}\n}`;
  })
  .join('\n\n');

const css = `/* GERADO por scripts/build.mjs a partir de tokens.json. Nao edite a mao. */
/* Regerar: pnpm --filter @webag/tokens build */
:root {
  color-scheme: light;
${variables}
}

/* Movimento reduzido: sem animacao de deslocamento; so troca de estado. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --wb-motion-duration-fast: 0ms;
    --wb-motion-duration-base: 0ms;
    --wb-motion-duration-slow: 0ms;
  }
}

/* Estilos de texto (equivalentes aos textStyle do app). */
${textClasses}

/* Anel de foco padrao (WCAG 2.4.7). Aplicar em todo controle interativo. */
.wb-focus-ring:focus-visible {
  outline: var(--wb-border-width-strong) solid var(--wb-color-border-focus);
  outline-offset: 2px;
}
`;

function write(relativePath, content) {
  const file = resolve(root, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
  console.log(`gerado ${relativePath}`);
}

write('src/tokens.ts', ts);
write('css/tokens.css', css);
