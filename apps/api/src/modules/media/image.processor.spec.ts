import sharp from 'sharp';
import { imageJobStats, inspectImage, MAX_CONCURRENT_IMAGE_JOBS, renderVariants, VARIANT_WIDTHS } from './image.processor.js';

/** BUG-010 (I8): o processamento de imagem é limitado; muitos envios ao mesmo tempo não decodificam todos juntos. */
describe('Processamento de imagem limitado (BUG-010)', () => {
  it('20 envios simultâneos nunca passam do teto de trabalhos do sharp em paralelo e todos terminam', async () => {
    // PNG com ruído (não comprime): 3000 x 2000 px = 6 MP, de verdade na memória.
    const raw = Buffer.alloc(3000 * 2000 * 3);
    for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) >>> 24;
    const png = await sharp(raw, { raw: { width: 3000, height: 2000, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();

    const results = await Promise.all(Array.from({ length: 20 }, () => renderVariants(png, VARIANT_WIDTHS)));
    expect(results).toHaveLength(20);
    expect(results.every((r) => r.size === VARIANT_WIDTHS.length)).toBe(true);
    expect(imageJobStats.peak).toBeGreaterThan(0);
    expect(imageJobStats.peak).toBeLessThanOrEqual(MAX_CONCURRENT_IMAGE_JOBS);
    expect(imageJobStats.running()).toBe(0);
    expect(imageJobStats.waiting()).toBe(0);
  }, 60_000);

  it('recusa acima do teto de megapixels do PNG antes de decodificar (cabeçalho apenas)', async () => {
    const huge = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: '#808080' } }).png({ compressionLevel: 9 }).toBuffer(); // 30 MP chapado, poucos KB
    expect(huge.length).toBeLessThan(5 * 1024 * 1024);
    await expect(inspectImage(huge)).rejects.toThrow(/PNG é grande demais/);
  }, 30_000);
});
