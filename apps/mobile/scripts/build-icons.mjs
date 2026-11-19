#!/usr/bin/env node
// Gera src/icons/solar-data.ts so com os icones Solar usados (docs/design/recursos/icones/solar.json nao e versionado).
// Estilos: linear (navegacao neutra) e bold-duotone (marca); "bold" so para estrela e coracao (preenchidos).
// Uso: node scripts/build-icons.mjs  (precisa do solar.json local; o resultado e versionado)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const solar = JSON.parse(readFileSync(resolve(here, '../../../docs/design/recursos/icones/solar.json'), 'utf8')).icons;
const tabler = JSON.parse(readFileSync(resolve(here, '../../../docs/design/recursos/icones/tabler.json'), 'utf8')).icons;

// Nome no app -> nome Solar (sem sufixo de estilo).
const MAP = {
  eye: 'eye', eyeSlash: 'eye-closed', caretLeft: 'alt-arrow-left', caretRight: 'alt-arrow-right', caretDown: 'alt-arrow-down',
  caretUp: 'alt-arrow-up', arrowLeft: 'arrow-left', arrowRight: 'arrow-right', checkCircle: 'check-circle', warningCircle: 'danger-circle',
  wifiSlash: 'wi-fi-router', mapPin: 'map-point', crosshair: 'gps', xCircle: 'close-circle', dotsThree: 'menu-dots', info: 'info-circle',
  envelope: 'letter', trash: 'trash-bin-trash', pencil: 'pen', house: 'home-smile', briefcase: 'case-minimalistic',
  warning: 'danger-triangle', bag: 'bag-5', search: 'magnifier', star: 'star', store: 'shop-2', heart: 'heart', share: 'share',
  clock: 'clock-circle', scooter: 'scooter', refresh: 'refresh', tag: 'tag', grid: 'widget-2', history: 'history', sealCheck: 'verified-check',
  user: 'user-rounded', box: 'box', gift: 'gift', signIn: 'login-2', signOut: 'logout-2', sliders: 'tuning-2', sort: 'sort-vertical',
  image: 'gallery', sad: 'sad-circle', receipt: 'bill-list', ruler: 'ruler-pen', userCircle: 'user-circle', question: 'question-circle',
  hourglass: 'hourglass', copy: 'copy', bank: 'bank', card: 'card', navigation: 'map-arrow-right', shield: 'shield-check',
  undo: 'undo-left-round', lock: 'lock', qr: 'qr-code', camera: 'camera', swap: 'transfer-horizontal', bell: 'bell', calendar: 'calendar',
  palette: 'palette', phone: 'phone', meh: 'confounded-circle', smile: 'smile-circle', ticket: 'ticket-sale', download: 'download-minimalistic',
  document: 'document-text', flag: 'flag', settings: 'settings', headphones: 'headphones-round-sound', shieldUser: 'shield-user',
  key: 'key-minimalistic-2', globe: 'global', chat: 'chat-round-dots', trashAlt: 'trash-bin-2', addCircle: 'add-circle', minusCircle: 'minus-circle',
  mapArrow: 'map-point', bellOff: 'bell-off', letterOpen: 'letter-opened', cart: 'cart-large-2',
};
const SOLID = new Set(['star', 'heart']);

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
  for (const [key, suffix] of [['l', 'linear'], ['d', 'bold-duotone'], ['b', 'bold']]) {
    if (key === 'b' && !SOLID.has(name)) continue;
    const icon = solar[`${base}-${suffix}`];
    if (!icon) { if (key !== 'b') missing.push(`${base}-${suffix}`); continue; }
    entry[key] = parse(icon.body);
  }
  out[name] = entry;
}
out.whatsapp = { l: parse(tabler['brand-whatsapp'].body) };
if (missing.length) console.warn('Sem estilo:', missing.join(', '));

const ts = `// GERADO por scripts/build-icons.mjs (Solar, Iconify, CC BY 4.0 / uso em app com atribuicao no About; WhatsApp: Tabler MIT). Nao edite a mao.
// Nos: t = tag, a = atributos, k = filhos. l = linear, d = bold-duotone, b = bold.
export interface SvgNode { t: string; a: Record<string, string>; k?: SvgNode[] }
export interface IconData { l?: SvgNode[]; d?: SvgNode[]; b?: SvgNode[] }
export const ICON_DATA: Record<string, IconData> = ${JSON.stringify(out)};
export type IconName = ${Object.keys(out).map((k) => `'${k}'`).join(' | ')};
`;
writeFileSync(resolve(here, '../src/icons/solar-data.ts'), ts);
console.log('icones:', Object.keys(out).length, 'bytes:', ts.length);
