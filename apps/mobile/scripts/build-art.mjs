#!/usr/bin/env node
// Gera src/art/objects-data.ts (12 objetos de produto, bloco OBJ do prototipo v3) e src/art/kit.generated.tsx
// (SVGs de docs/design/kit convertidos em componentes react-native-svg). Uso: node scripts/build-art.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');

// ---------- objetos de produto ----------
const html = readFileSync(resolve(repo, 'docs/prototipo/app-cliente-v3.html'), 'utf8');
const start = html.indexOf("const oG=rx=>");
const end = html.indexOf("document.body.insertAdjacentHTML('afterbegin',`<svg width=\"0\"");
const block = html.slice(start, end);
const helpers = `
const j=(a)=>JSON.stringify(a)+'\\n';
const oP=(t,d,sw=5)=>j(['P',t,d,sw]);
const oL=(t,d,w)=>j(['L',t,d,w]);
const oR=(t,x,y,w,h,r)=>j(['R',t,x,y,w,h,r]);
const oC=(t,cx,cy,r)=>j(['C',t,cx,cy,r]);
const oE=(t,cx,cy,rx,ry,rot)=>j(['E',t,cx,cy,rx,ry,rot||0]);
const oG=rx=>oE('g',100,184,rx,7);
`;
const body = block.replace(/^const oG=.*\n/, '');
const OBJ = new Function(`${helpers}${body}; return OBJ;`)();
const objects = {};
for (const [key, value] of Object.entries(OBJ)) {
  objects[key] = { name: value.n, shapes: value.d.trim().split('\n').map((l) => JSON.parse(l)) };
}
writeFileSync(
  resolve(here, '../src/art/objects-data.ts'),
  `// GERADO por scripts/build-art.mjs a partir do bloco OBJ de docs/prototipo/app-cliente-v3.html (kit-marca-v3.md §7). Nao edite a mao.
// Formas: P = preenchimento com traço da mesma cor (cantos arredondados), L = linha, R = retângulo, C = círculo, E = elipse. Tons: b base, s sombra, h realce, x acento, g chão, k/n/w/m/v/vl fixos.
export type ArtShape = readonly ['P', string, string, number] | readonly ['L', string, string, number] | readonly ['R', string, number, number, number, number, number] | readonly ['C', string, number, number, number] | readonly ['E', string, number, number, number, number, number];
export const OBJECT_DATA: Record<string, { name: string; shapes: readonly ArtShape[] }> = ${JSON.stringify(objects)} as never;
export type ObjectName = ${Object.keys(objects).map((k) => `'${k}'`).join(' | ')};
export const OBJECT_NAMES = ${JSON.stringify(Object.keys(objects))} as const;
`,
);

// ---------- kit de marca ----------
const kitDir = resolve(repo, 'docs/design/kit');
const SKIP = new Set(['barras-carregando.svg', 'barras-progresso.svg']); // feitos à mão (animação / props)
const pascal = (s) => s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const TAG = { svg: 'Svg', g: 'G', rect: 'Rect', circle: 'Circle', path: 'Path', polygon: 'Polygon', ellipse: 'Ellipse', line: 'Line' };
const used = new Set(['Svg']);

function toJsx(svg) {
  const clean = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const out = [];
  const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  let m;
  let width = 0, height = 0, label = '';
  while ((m = re.exec(clean))) {
    const [, close, tag, rawAttrs, self] = m;
    const T = TAG[tag];
    if (!T) continue;
    used.add(T);
    if (close) { out.push(`</${T}>`); continue; }
    const attrs = [];
    for (const a of rawAttrs.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      const [, k, v] = a;
      if (tag === 'svg') {
        if (k === 'width') width = Number(v);
        if (k === 'height') height = Number(v);
        if (k === 'viewBox') attrs.push(`viewBox="${v}"`);
        if (k === 'aria-label') label = v;
        continue;
      }
      if (['class', 'role', 'aria-label', 'id'].includes(k)) continue;
      attrs.push(`${camel(k)}="${v}"`);
    }
    if (tag === 'svg') { out.push(`<Svg {...svgProps(${width}, ${height}, ${JSON.stringify(label)}, props)} ${attrs.join(' ')}>`); continue; }
    out.push(`<${T} ${attrs.join(' ')}${self ? ' /' : ''}>`);
  }
  return { jsx: out.join('\n      '), width, height, label };
}

const comps = [];
for (const file of readdirSync(kitDir).filter((f) => f.endsWith('.svg') && !SKIP.has(f))) {
  const name = pascal(file.replace('.svg', ''));
  const { jsx, width, height } = toJsx(readFileSync(resolve(kitDir, file), 'utf8'));
  comps.push({ name, file, width, height, jsx });
}
const names = [...used].sort();
const ts = `// GERADO por scripts/build-art.mjs a partir de docs/design/kit/*.svg. Nao edite a mao (edite o SVG e rode pnpm --filter @webag/mobile assets:art).
import Svg, { ${names.filter((n) => n !== 'Svg').join(', ')} } from 'react-native-svg';
import type { StyleProp, ViewStyle } from 'react-native';
import { svgHidden } from '../lib/a11y';

export interface ArtProps {
  /** Largura em dp; a altura segue a proporção do desenho. */
  width?: number;
  style?: StyleProp<ViewStyle>;
  /** Sem rótulo a arte é decorativa (escondida do leitor de tela). */
  accessibilityLabel?: string;
}

function svgProps(w: number, h: number, _label: string, props: ArtProps) {
  const width = props.width ?? w;
  return {
    width,
    height: (width * h) / w,
    style: props.style,
    accessibilityLabel: props.accessibilityLabel,
    ...svgHidden(!props.accessibilityLabel),
  };
}

${comps
  .map(
    (c) => `/** ${c.file} (${c.width} x ${c.height}). */
export function ${c.name}(props: ArtProps) {
  return (
      ${c.jsx}
  );
}
`,
  )
  .join('\n')}
export const KIT_SIZES = ${JSON.stringify(Object.fromEntries(comps.map((c) => [c.name, [c.width, c.height]])))} as const;
`;
writeFileSync(resolve(here, '../src/art/kit.generated.tsx'), ts);
console.log('objetos:', Object.keys(objects).length, 'kit:', comps.map((c) => c.name).join(', '));
