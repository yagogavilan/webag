import sharp from 'sharp';

/**
 * Arte dos banners do seed (kit de marca v3, `docs/design/kit-marca-v3.md`): bloco de cor SÓLIDA (roxo, noite ou lima), objeto da categoria
 * chapado em 3 tons (base, sombra, realce), sombra de chão sólida, as 3 barras do símbolo, título e CTA. Sem gradiente, contorno, textura ou rosto.
 * Gerada em SVG e rasterizada com `sharp` (PNG 1200 x 600, 2:1). O texto usa a fonte do sistema (Bricolage/Figtree se houver, senão sans-serif).
 */
export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 600;

/** Tokens do kit v3 (sólidos). */
const INK = '#1C1721'; // noite
const PURPLE = '#C02EF0'; // roxo
const LIME = '#D6FF4A'; // acento
const SUN = '#FFC93C';
const WHITE = '#FFFFFF';

export type BannerObject = 'bag' | 'basket' | 'sneaker';
export type BannerTheme = 'purple' | 'ink' | 'lime';

export interface BannerArt {
  theme: BannerTheme;
  object: BannerObject;
  /** Até 2 linhas de título. */
  lines: [string] | [string, string];
  cta: string;
}

const THEMES: Record<BannerTheme, { bg: string; title: string; ctaBg: string; ctaText: string; bars: string; ground: string }> = {
  purple: { bg: PURPLE, title: WHITE, ctaBg: LIME, ctaText: INK, bars: LIME, ground: 'rgba(28,23,33,0.30)' },
  ink: { bg: INK, title: WHITE, ctaBg: LIME, ctaText: INK, bars: PURPLE, ground: 'rgba(0,0,0,0.45)' },
  lime: { bg: LIME, title: INK, ctaBg: INK, ctaText: LIME, bars: PURPLE, ground: 'rgba(28,23,33,0.16)' },
};

/** Objetos em uma grade de 480 x 420 (origem no canto superior esquerdo do objeto), pousados em y = 400. */
function objectShapes(kind: BannerObject, bg: string): string {
  if (kind === 'bag') {
    // Sacola do símbolo: corpo + alça, olhais na cor do fundo e as 3 barras.
    return `
      <path d="M150 150 C150 20 330 20 330 150" fill="none" stroke="${INK}" stroke-width="34" stroke-linecap="round"/>
      <path d="M70 130 H410 L440 372 Q444 400 416 400 H64 Q36 400 40 372 Z" fill="${PURPLE}"/>
      <path d="M338 130 H410 L440 372 Q444 400 416 400 H350 Z" fill="#8E1FB3"/>
      <rect x="84" y="130" width="30" height="270" fill="#D767F5"/>
      <circle cx="170" cy="168" r="17" fill="${bg}"/>
      <circle cx="310" cy="168" r="17" fill="${bg}"/>
      <rect x="130" y="238" width="62" height="26" rx="13" fill="${LIME}"/>
      <rect x="130" y="278" width="150" height="26" rx="13" fill="${LIME}"/>
      <rect x="130" y="318" width="102" height="26" rx="13" fill="${LIME}"/>`;
  }
  if (kind === 'basket') {
    // Cesta de mercado com frutas (lima, sol, roxo) e alça.
    return `
      <path d="M120 200 C120 40 360 40 360 200" fill="none" stroke="#B7791F" stroke-width="30" stroke-linecap="round"/>
      <circle cx="170" cy="190" r="58" fill="${LIME}"/>
      <circle cx="250" cy="150" r="64" fill="${SUN}"/>
      <circle cx="330" cy="196" r="54" fill="${PURPLE}"/>
      <path d="M40 210 H440 L400 390 Q396 404 380 404 H100 Q84 404 80 390 Z" fill="#E0A33A"/>
      <path d="M352 210 H440 L400 390 Q396 404 380 404 H340 Z" fill="#B7791F"/>
      <rect x="64" y="262" width="352" height="22" fill="#B7791F"/>
      <rect x="76" y="318" width="330" height="22" fill="#B7791F"/>
      <rect x="40" y="210" width="400" height="30" rx="8" fill="#F2BE5C"/>`;
  }
  // Tênis de perfil: solado branco, cabedal noite, ponteira, contraforte e as 3 barras do símbolo.
  return `
    <path d="M30 340 V298 C30 262 62 250 98 246 L172 234 C204 228 224 202 252 176 Q272 156 304 148 L420 130 Q456 128 458 168 V340 Z" fill="${INK}"/>
    <path d="M372 136 L420 130 Q456 128 458 168 V340 H356 Z" fill="#000000" opacity="0.35"/>
    <path d="M30 340 V298 C30 262 62 250 98 246 L190 236 V340 Z" fill="#E198EC"/>
    <rect x="30" y="334" width="426" height="44" rx="22" fill="${WHITE}"/>
    <rect x="270" y="352" width="186" height="26" rx="13" fill="#DAD3E0"/>
    <rect x="214" y="240" width="64" height="20" rx="10" fill="${LIME}"/>
    <rect x="214" y="274" width="150" height="20" rx="10" fill="${LIME}"/>
    <rect x="214" y="308" width="104" height="20" rx="10" fill="${LIME}"/>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** SVG da arte (exportado para o teste conferir que não há gradiente). */
export function bannerSvg(art: BannerArt): string {
  const t = THEMES[art.theme];
  const font = "font-family=\"'Bricolage Grotesque','Figtree','Inter','Helvetica Neue','DejaVu Sans',Arial,sans-serif\"";
  const lines = art.lines
    .map((line, i) => `<text x="80" y="${262 + i * 76}" ${font} font-size="66" font-weight="800" fill="${t.title}">${escapeXml(line)}</text>`)
    .join('');
  const ctaY = 262 + (art.lines.length - 1) * 76 + 62;
  const ctaWidth = Math.max(240, art.cta.length * 22 + 88);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" viewBox="0 0 ${BANNER_WIDTH} ${BANNER_HEIGHT}">
  <rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" fill="${t.bg}"/>
  <rect x="104" y="96" width="46" height="16" rx="8" fill="${t.bars}"/>
  <rect x="80" y="128" width="98" height="16" rx="8" fill="${t.bars}"/>
  <rect x="98" y="160" width="68" height="16" rx="8" fill="${t.bars}"/>
  ${lines}
  <rect x="80" y="${ctaY}" width="${ctaWidth}" height="84" rx="42" fill="${t.ctaBg}"/>
  <text x="${80 + ctaWidth / 2}" y="${ctaY + 55}" text-anchor="middle" ${font} font-size="34" font-weight="800" fill="${t.ctaText}">${escapeXml(art.cta)}</text>
  <ellipse cx="900" cy="552" rx="230" ry="20" fill="${t.ground}"/>
  <g transform="translate(660 152)">${objectShapes(art.object, t.bg)}</g>
</svg>`;
}

export async function bannerImage(art: BannerArt): Promise<Buffer> {
  return sharp(Buffer.from(bannerSvg(art))).png().toBuffer();
}
