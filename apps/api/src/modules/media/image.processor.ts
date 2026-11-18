import sharp from 'sharp';

/** SEC-050 / SEC-108: no máximo 40 megapixels e tempo limitado; metadados (EXIF/GPS) nunca vão para o público. */
export const MAX_PIXELS = 40_000_000;
export const PROCESS_TIMEOUT_MS = 10_000;
export const VARIANT_WIDTHS = [160, 400, 800, 1600] as const;

export class ImageRejected extends Error {}

const withTimeout = async <T>(work: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ImageRejected('A imagem demorou demais para processar.')), PROCESS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export interface ImageInfo {
  width: number;
  height: number;
}

/** Lê só o cabeçalho (barato) e recusa antes de decodificar o que passa de 40 MP. */
export async function inspectImage(buf: Buffer): Promise<ImageInfo> {
  try {
    const meta = await withTimeout(sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata());
    if (!meta.width || !meta.height) throw new ImageRejected('Imagem inválida.');
    if (meta.width * meta.height > MAX_PIXELS) throw new ImageRejected('A imagem é grande demais (máximo de 40 megapixels).');
    if ((meta.pages ?? 1) > 1) throw new ImageRejected('Imagens animadas não são aceitas.');
    return { width: meta.width, height: meta.height };
  } catch (error) {
    if (error instanceof ImageRejected) throw error;
    throw new ImageRejected('Não foi possível ler a imagem.');
  }
}

/** WebP re-codificado: aplica a rotação do EXIF e descarta TODOS os metadados (o padrão do sharp é não copiar). */
export async function renderVariant(buf: Buffer, width: number): Promise<Buffer> {
  try {
    return await withTimeout(
      sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
    );
  } catch (error) {
    if (error instanceof ImageRejected) throw error;
    throw new ImageRejected('Não foi possível processar a imagem.');
  }
}

/** Proporção largura/altura dentro da tolerância (logo 1:1, capa 16:9). */
export const ratioWithin = (info: ImageInfo, target: number, tolerance: number): boolean => Math.abs(info.width / info.height - target) / target <= tolerance;
