// Ilustracoes de produto (kit v3: cores chapadas, 3 tons por objeto, sem degrade) para o banco de marketing.
// Substitui as "fotos" do seed (degrade + formas) so no S3 local desta captura. Uso: node produtos.mjs <pasta-s3-media>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const sharp = createRequire('/home/user/webag/apps/api/package.json')('sharp');
const INK = '#1C1721', PURPLE = '#C02EF0', LIME = '#D6FF4A', SUN = '#FFC93C', WHITE = '#FFFFFF', LAV = '#EFE9F5';
const bars = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="22" y="0" width="64" height="22" rx="11" fill="${c}"/><rect x="0" y="34" width="132" height="22" rx="11" fill="${c}"/><rect x="18" y="68" width="92" height="22" rx="11" fill="${c}"/></g>`;
const ground = (cx, cy, rx, color) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="26" fill="${color}"/>`;
const frame = (bg, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="${bg}"/>${body}</svg>`;

const ART = {
  'Camiseta básica algodão': frame(LIME, `
    ${ground(600, 960, 330, 'rgba(28,23,33,0.16)')}
    <path d="M410 230 L270 290 L120 450 L240 560 L330 480 L330 930 H870 V480 L960 560 L1080 450 L930 290 L790 230 C760 330 440 330 410 230 Z" fill="${PURPLE}"/>
    <path d="M790 230 L930 290 L1080 450 L960 560 L870 480 V930 H760 V300 Z" fill="#8E1FB3"/>
    <path d="M120 450 L270 290 L330 320 L330 480 L240 560 Z" fill="#D767F5"/>
    <path d="M410 230 C440 330 760 330 790 230 C770 270 440 270 410 230 Z" fill="#8E1FB3"/>
    <path d="M410 230 C440 310 760 310 790 230" fill="none" stroke="#D767F5" stroke-width="20" stroke-linecap="round"/>
    ${bars(470, 520, LIME, 1.5)}`),
  'Bermuda de sarja': frame(PURPLE, `
    ${ground(600, 960, 330, 'rgba(28,23,33,0.30)')}
    <path d="M330 250 H870 L950 930 H660 L600 560 L540 930 H250 Z" fill="${WHITE}"/>
    <path d="M870 250 L950 930 H800 L760 430 Z" fill="#DAD3E0"/>
    <rect x="330" y="250" width="540" height="76" rx="8" fill="#DAD3E0"/>
    <rect x="330" y="250" width="540" height="22" rx="8" fill="${WHITE}"/>
    <path d="M600 326 V560" stroke="#DAD3E0" stroke-width="12"/>
    <circle cx="600" cy="288" r="20" fill="${PURPLE}"/>
    <path d="M360 340 Q430 420 470 520" fill="none" stroke="#DAD3E0" stroke-width="12" stroke-linecap="round"/>
    <path d="M840 340 Q770 420 730 520" fill="none" stroke="#C4BACD" stroke-width="12" stroke-linecap="round"/>
    <rect x="270" y="870" width="262" height="24" rx="12" fill="#DAD3E0"/><rect x="670" y="870" width="262" height="24" rx="12" fill="#C4BACD"/>
    ${bars(330, 700, LIME, 0.9)}`),
  'Vestido midi floral': frame(SUN, `
    ${ground(600, 990, 340, 'rgba(28,23,33,0.18)')}
    <path d="M470 150 L525 150 L565 330 H635 L675 150 L730 150 L765 380 L700 490 L920 980 H280 L500 490 L435 380 Z" fill="${INK}"/>
    <path d="M730 150 L765 380 L700 490 L920 980 H760 L650 490 L690 330 Z" fill="#000" opacity="0.35"/>
    <path d="M435 380 L500 490 L700 490 L765 380 L650 330 H550 Z" fill="${PURPLE}"/>
    <rect x="496" y="486" width="208" height="24" fill="${LIME}"/>
    ${[[430, 700, 1.0], [640, 640, 0.8], [780, 780, 1.0], [540, 860, 0.8], [350, 890, 0.7], [700, 900, 0.7]].map(([x, y, s], i) => {
      const petal = i % 2 ? SUN : PURPLE; const core = i % 2 ? PURPLE : LIME;
      return `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-34" r="26" fill="${petal}" transform="rotate(${a})"/>`).join('')}<circle r="18" fill="${core}"/></g>`;
    }).join('')}`),
  'Tênis casual': frame(LAV, `
    ${ground(600, 838, 380, 'rgba(28,23,33,0.16)')}
    <g transform="translate(138 132) scale(1.85)">
    <path d="M30 340 V298 C30 262 62 250 98 246 L172 234 C204 228 224 202 252 176 Q272 156 304 148 L400 132 C450 126 466 170 466 220 C466 290 450 320 436 340 Z" fill="${INK}"/>
    <path d="M372 136 L400 132 C450 126 466 170 466 220 C466 290 450 320 436 340 H356 Z" fill="#000000" opacity="0.35"/>
    <path d="M30 340 V298 C30 262 62 250 98 246 L190 236 V340 Z" fill="#E198EC"/>
    <rect x="30" y="334" width="440" height="44" rx="22" fill="${WHITE}"/>
    <rect x="270" y="352" width="200" height="26" rx="13" fill="#DAD3E0"/>
    <rect x="214" y="240" width="64" height="20" rx="10" fill="${LIME}"/>
    <rect x="214" y="274" width="150" height="20" rx="10" fill="${LIME}"/>
    <rect x="214" y="308" width="104" height="20" rx="10" fill="${LIME}"/></g>`),
  'Chinelo de borracha': frame(INK, `
    ${ground(600, 1000, 360, 'rgba(0,0,0,0.45)')}
    <g transform="rotate(-8 600 600)">
      <path d="M300 180 C410 150 470 260 470 420 C470 660 440 880 360 940 C300 990 230 940 220 840 C200 660 210 420 230 300 C240 230 260 195 300 180 Z" fill="${LIME}"/>
      <path d="M470 420 C470 660 440 880 360 940 C390 700 400 520 380 300 C440 280 470 340 470 420 Z" fill="#9BBF22"/>
      <path d="M300 250 L350 520 L400 280" fill="none" stroke="${PURPLE}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="350" cy="520" r="30" fill="#8E1FB3"/>
      <path d="M700 180 C810 150 870 260 870 420 C870 660 840 880 760 940 C700 990 630 940 620 840 C600 660 610 420 630 300 C640 230 660 195 700 180 Z" fill="${LIME}" transform="translate(20 0)"/>
      <path d="M890 420 C890 660 860 880 780 940 C810 700 820 520 800 300 C860 280 890 340 890 420 Z" fill="#9BBF22"/>
      <path d="M720 250 L770 520 L820 280" fill="none" stroke="${PURPLE}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round" transform="translate(20 0)"/>
      <circle cx="790" cy="520" r="30" fill="#8E1FB3"/>
    </g>`),
  'Boné aba reta': frame(PURPLE, `
    ${ground(600, 900, 380, 'rgba(28,23,33,0.30)')}
    <path d="M230 700 C230 360 380 230 600 230 C820 230 970 360 970 700 Z" fill="${INK}"/>
    <path d="M790 240 C910 300 970 450 970 700 H800 C810 520 800 360 790 240 Z" fill="#000" opacity="0.4"/>
    <path d="M230 700 C230 360 330 250 440 235 C340 380 330 540 340 700 Z" fill="#3A3142"/>
    <circle cx="600" cy="236" r="30" fill="#3A3142"/>
    <path d="M600 250 C560 400 560 560 580 700" fill="none" stroke="#3A3142" stroke-width="12"/>
    <path d="M600 250 C640 400 640 560 620 700" fill="none" stroke="#3A3142" stroke-width="12"/>
    <path d="M200 700 H1010 C1030 700 1040 730 1020 750 L1000 800 C990 830 960 840 930 840 H260 C230 840 215 820 205 790 L190 750 C180 725 185 700 200 700 Z" fill="${INK}"/>
    <rect x="200" y="780" width="820" height="60" rx="30" fill="#000" opacity="0.4"/>
    <rect x="200" y="690" width="810" height="26" rx="13" fill="#3A3142"/>
    ${bars(520, 480, LIME, 1.0)}`),
};

export async function writeArt(root, assetByProduct) {
  for (const [name, assetId] of Object.entries(assetByProduct)) {
    const svg = ART[name];
    if (!svg) continue;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    for (const w of [800, 400, 160]) {
      const dir = join(root, assetId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${w}.webp`), await sharp(png).resize({ width: w }).webp({ quality: 85 }).toBuffer());
    }
  }
}
export const PRODUCT_NAMES = Object.keys(ART);
export const preview = async (file) => {
  const tiles = await Promise.all(PRODUCT_NAMES.map((n) => sharp(Buffer.from(ART[n])).resize(400).png().toBuffer()));
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#ffffff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 400, top: Math.floor(i / 3) * 400 }))).png().toFile(file);
};
if (process.argv[1].endsWith('produtos.mjs') && process.argv[2] === 'preview') await preview('/tmp/webag-mkt/sheet/arte.png');
