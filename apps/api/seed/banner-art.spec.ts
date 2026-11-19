import sharp from 'sharp';
import { BANNER_HEIGHT, BANNER_WIDTH, bannerImage, bannerSvg, type BannerArt } from './banner-art.js';

const ARTS: BannerArt[] = [
  { theme: 'lime', object: 'bag', lines: ['Frete grátis', 'acima de R$ 50'], cta: 'Usar cupom' },
  { theme: 'ink', object: 'basket', lines: ['Tudo para o', 'seu mercado'], cta: 'Ver mercado' },
  { theme: 'purple', object: 'sneaker', lines: ['Novidades na', 'Moda Passo Firme'], cta: 'Ver loja' },
];

describe('arte dos banners do seed (kit v3)', () => {
  it.each(ARTS)('$object: SVG sem gradiente, sem filtro e sem transparência, com título e CTA', (art) => {
    const svg = bannerSvg(art);
    expect(svg).not.toMatch(/gradient|<filter|<image|blur|stop-color/i);
    for (const line of art.lines) expect(svg).toContain(line);
    expect(svg).toContain(art.cta);
  });

  it.each(ARTS)('$object: PNG 1200 x 600 (2:1) com o bloco de cor sólido nos cantos e pouca variedade de cor', async (art) => {
    const png = await bannerImage(art);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([BANNER_WIDTH, BANNER_HEIGHT]);
    const px = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)].join(',');
    // Os 4 cantos têm a mesma cor (bloco sólido, não degradê).
    expect(new Set([px(2, 2), px(info.width - 3, 2), px(2, info.height - 3), px(info.width - 3, info.height - 3)]).size).toBe(1);
    // Sólido: poucas cores no total (as bordas suavizadas do texto somam, mas nada de rampa contínua).
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += info.channels) colors.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    expect(colors.size).toBeLessThan(4_000);
  });
});
