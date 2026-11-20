#!/usr/bin/env node
// Gera src/components/ui/solar-data.ts só com os ícones Solar usados nos painéis (v3, onda-7-paineis-v3 §0).
// Fonte: docs/design/recursos/icones/solar.json (não versionado; mesma origem de apps/mobile/scripts/build-icons.mjs).
// Estilos: linear (navegação e ações) e bold-duotone (metadado de marca). Uso: node scripts/build-icons.mjs (o resultado é versionado).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const solar = JSON.parse(readFileSync(resolve(here, '../../../docs/design/recursos/icones/solar.json'), 'utf8')).icons;

// Nome no painel -> nome Solar (sem sufixo de estilo).
const MAP = {
  home: 'home-smile', orders: 'bill-list', box: 'box', exchange: 'refresh', star: 'star', wallet: 'wallet', store: 'shop-2', team: 'users-group-rounded',
  help: 'question-circle', account: 'user-circle', signOut: 'logout-2', more: 'widget-2', chart: 'chart-2', scooter: 'scooter', shield: 'shield-check',
  eye: 'eye', warning: 'danger-triangle', info: 'info-circle', percent: 'percent', tag: 'tag', gallery: 'gallery', ticket: 'ticket-sale', bell: 'bell',
  bellOff: 'bell-off', map: 'map', layers: 'layers', settings: 'settings', flag: 'flag', document: 'document-text', clipboard: 'clipboard-list',
  user: 'user-rounded', clock: 'clock-circle', alert: 'danger-circle', check: 'check-circle', close: 'close-circle', search: 'magnifier',
  caretRight: 'alt-arrow-right', caretLeft: 'alt-arrow-left', volume: 'volume-loud', volumeOff: 'volume-cross', sliders: 'tuning-2', scale: 'scale', mail: 'letter',
  bag: 'bag-5', phone: 'phone', whatsapp: 'chat-round-dots', route: 'route', menu: 'hamburger-menu', undo: 'undo-left-round',
};

// Só estes têm a versão bold-duotone (metadado de marca); os demais só linear, para não pesar no navegador.
const DUO = new Set(['clock', 'scooter', 'bell', 'bellOff', 'warning', 'alert', 'box', 'star', 'check']);

function parse(body) {
  const root = { kids: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(body))) {
    const [, close, tag, rawAttrs, self] = m;
    if (close) { stack.pop(); continue; }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node = { t: tag, a: attrs };
    stack[stack.length - 1].kids.push(node);
    if (!self) { node.kids = []; stack.push(node); }
  }
  const strip = (n) => ({ t: n.t, a: n.a, ...(n.kids?.length ? { k: n.kids.map(strip) } : {}) });
  return root.kids.map(strip);
}

const out = {};
const missing = [];
for (const [name, base] of Object.entries(MAP)) {
  const entry = {};
  for (const [key, suffix] of [['l', 'linear'], ['d', 'bold-duotone']]) {
    if (key === 'd' && !DUO.has(name)) continue;
    const icon = solar[`${base}-${suffix}`];
    if (!icon) { missing.push(`${base}-${suffix}`); continue; }
    entry[key] = parse(icon.body);
  }
  out[name] = entry;
}
if (missing.length) console.warn('Sem estilo:', missing.join(', '));
const ts = `// GERADO por scripts/build-icons.mjs (Solar Icon Set, 480 Design, CC BY 4.0, alterado: convertido em componente e recolorido; crédito em /licencas). Não edite à mão.
// Nós: t = tag, a = atributos, k = filhos. l = linear, d = bold-duotone.
export interface SvgNode { t: string; a: Record<string, string>; k?: SvgNode[] }
export interface IconData { l?: SvgNode[]; d?: SvgNode[] }
export const ICON_DATA: Record<string, IconData> = ${JSON.stringify(out)};
export type SolarName = ${Object.keys(out).map((k) => `'${k}'`).join(' | ')};
`;
writeFileSync(resolve(here, '../src/components/ui/solar-data.ts'), ts);
console.log('ícones:', Object.keys(out).length, 'bytes:', ts.length);
