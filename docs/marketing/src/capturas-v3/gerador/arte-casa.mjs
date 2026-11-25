// Ilustracoes (kit v3, cores chapadas) dos produtos de casa e presentes da loja de marketing. Uso: importado por preparar-dados.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const sharp = createRequire('/home/user/webag/apps/api/package.json')('sharp');
const INK = '#1C1721', PURPLE = '#C02EF0', DPURPLE = '#8E1FB3', LPURPLE = '#D767F5', LIME = '#D6FF4A', DLIME = '#9BBF22', SUN = '#FFC93C', DSUN = '#D9A21A', WHITE = '#FFFFFF', GREY = '#DAD3E0', LAV = '#EFE9F5';
const ground = (cx, cy, rx, c = 'rgba(28,23,33,0.18)') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="26" fill="${c}"/>`;
const frame = (bg, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="${bg}"/>${body}</svg>`;
export const ART = {
  'Vaso de cerâmica': frame(SUN, `${ground(600, 960, 300)}
    <path d="M600 330 C520 250 430 230 380 150" fill="none" stroke="${DLIME}" stroke-width="26" stroke-linecap="round"/>
    <path d="M600 330 C700 230 790 200 850 120" fill="none" stroke="${DLIME}" stroke-width="26" stroke-linecap="round"/>
    <ellipse cx="380" cy="170" rx="50" ry="90" fill="${LIME}" transform="rotate(-35 380 170)"/>
    <ellipse cx="850" cy="140" rx="50" ry="90" fill="${LIME}" transform="rotate(35 850 140)"/>
    <path d="M470 340 H730 C730 420 810 480 830 620 C850 790 790 930 700 960 H500 C410 930 350 790 370 620 C390 480 470 420 470 340 Z" fill="${PURPLE}"/>
    <path d="M730 340 C730 420 810 480 830 620 C850 790 790 930 700 960 H650 C730 880 760 760 740 600 C730 500 700 420 690 340 Z" fill="${DPURPLE}"/>
    <rect x="450" y="320" width="300" height="46" rx="23" fill="${LPURPLE}"/>
    <rect x="470" y="600" width="260" height="30" rx="15" fill="${LIME}"/>`),
  'Luminária de mesa': frame(LAV, `${ground(600, 1010, 260)}
    <path d="M430 220 H770 L860 560 H340 Z" fill="${SUN}"/>
    <path d="M770 220 L860 560 H720 L690 220 Z" fill="${DSUN}"/>
    <rect x="570" y="560" width="60" height="380" rx="12" fill="${INK}"/>
    <ellipse cx="600" cy="980" rx="230" ry="42" fill="${INK}"/>
    <ellipse cx="600" cy="960" rx="230" ry="42" fill="#3A3142"/>
    <path d="M430 220 H770" stroke="${WHITE}" stroke-width="14" stroke-linecap="round" opacity="0.55"/>
    <circle cx="600" cy="560" r="24" fill="${LIME}"/>`),
  'Almofada de linho': frame(PURPLE, `${ground(600, 940, 330, 'rgba(28,23,33,0.30)')}
    <path d="M260 280 C420 230 780 230 940 280 C980 460 980 640 940 820 C780 870 420 870 260 820 C220 640 220 460 260 280 Z" fill="${WHITE}"/>
    <path d="M940 280 C980 460 980 640 940 820 C880 840 840 850 800 856 C850 640 850 460 800 244 C860 252 900 264 940 280 Z" fill="${GREY}"/>
    <path d="M380 270 C340 460 340 640 380 840" fill="none" stroke="${LIME}" stroke-width="34" stroke-linecap="round"/>
    <path d="M500 255 C470 460 470 640 500 850" fill="none" stroke="${LIME}" stroke-width="34" stroke-linecap="round"/>
    <path d="M620 250 C600 460 600 640 620 855" fill="none" stroke="${LIME}" stroke-width="34" stroke-linecap="round"/>
    <path d="M740 250 C730 460 730 640 740 855" fill="none" stroke="${LIME}" stroke-width="34" stroke-linecap="round"/>`),
  'Vela aromática': frame(LIME, `${ground(600, 960, 290, 'rgba(28,23,33,0.20)')}
    <path d="M600 190 C660 270 690 330 650 400 C630 430 570 430 550 400 C510 330 550 270 600 190 Z" fill="${SUN}"/>
    <path d="M600 280 C625 320 635 350 615 385 C605 400 595 400 585 385 C565 350 575 320 600 280 Z" fill="${WHITE}"/>
    <rect x="590" y="420" width="20" height="60" rx="10" fill="${INK}"/>
    <path d="M360 480 H840 V900 C840 950 790 970 740 970 H460 C410 970 360 950 360 900 Z" fill="${WHITE}"/>
    <path d="M840 480 V900 C840 950 790 970 740 970 H680 C730 950 740 920 740 880 V480 Z" fill="${GREY}"/>
    <rect x="340" y="450" width="520" height="50" rx="25" fill="${INK}"/>
    <rect x="420" y="640" width="360" height="170" rx="20" fill="${PURPLE}"/>
    <rect x="460" y="690" width="170" height="26" rx="13" fill="${LIME}"/><rect x="460" y="740" width="250" height="26" rx="13" fill="${LIME}"/>`),
  'Caneca esmaltada': frame(SUN, `${ground(590, 940, 300, 'rgba(28,23,33,0.20)')}
    <path d="M800 400 C960 390 1010 480 1000 580 C990 690 920 740 790 730" fill="none" stroke="${INK}" stroke-width="64" stroke-linecap="round"/>
    <path d="M300 340 H810 V780 C810 900 740 950 640 950 H470 C370 950 300 900 300 780 Z" fill="${WHITE}"/>
    <path d="M810 340 V780 C810 900 740 950 640 950 H580 C670 920 700 860 700 780 V340 Z" fill="${GREY}"/>
    <rect x="290" y="320" width="530" height="56" rx="28" fill="${INK}"/>
    <rect x="360" y="560" width="300" height="34" rx="17" fill="${PURPLE}"/><rect x="360" y="630" width="200" height="34" rx="17" fill="${LIME}"/>`),
  'Porta-retrato': frame(LAV, `${ground(600, 990, 330)}
    <path d="M360 960 L600 760 L840 960 Z" fill="#3A3142"/>
    <rect x="240" y="190" width="720" height="760" rx="24" fill="${INK}"/>
    <rect x="300" y="250" width="600" height="640" rx="10" fill="${PURPLE}"/>
    <circle cx="460" cy="440" r="70" fill="${SUN}"/>
    <path d="M300 890 L520 600 L650 760 L740 650 L900 890 Z" fill="${LIME}"/>
    <path d="M740 650 L900 890 H800 L700 700 Z" fill="${DLIME}"/>`),
};
export async function writeArt(root, assetByProduct, art = ART) {
  for (const [name, assetId] of Object.entries(assetByProduct)) {
    const svg = art[name];
    if (!svg) continue;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    for (const w of [800, 400, 160]) {
      mkdirSync(join(root, assetId), { recursive: true });
      writeFileSync(join(root, assetId, `${w}.webp`), await sharp(png).resize({ width: w }).webp({ quality: 85 }).toBuffer());
    }
  }
}
export const preview = async (file) => {
  const names = Object.keys(ART);
  const tiles = await Promise.all(names.map((n) => sharp(Buffer.from(ART[n])).resize(300).png().toBuffer()));
  await sharp({ create: { width: 900, height: 600, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 300, top: Math.floor(i / 3) * 300 }))).png().toFile(file);
};
if (process.argv[1].endsWith('arte-casa.mjs') && process.argv[2] === 'preview') await preview('/tmp/webag-mkt/v3/arte-casa.png');
