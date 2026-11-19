import sharp from 'sharp';
/** SEC-050 / SEC-108: no máximo 40 megapixels e tempo limitado; metadados (EXIF/GPS) nunca vão para o público. */
export const MAX_PIXELS = 40_000_000;
export const PROCESS_TIMEOUT_MS = 10_000;
export const VARIANT_WIDTHS = [160, 400, 800, 1600];
/** I8: PNG não tem shrink-on-load (decodifica inteiro): teto menor; JPEG celular de 48/50 MP passa. */
export const MAX_PIXELS_PNG = 25_000_000;
/** I8: no máximo N processamentos de imagem ao mesmo tempo no processo que atende HTTP. */
export const MAX_CONCURRENT_IMAGE_JOBS = 2;
sharp.concurrency(MAX_CONCURRENT_IMAGE_JOBS);
export class ImageRejected extends Error {
}
/** Semáforo em memória: a vaga só volta quando o trabalho do sharp termina de verdade (o timeout não o interrompe). */
let running = 0;
const waiting = [];
/** Contadores do semáforo (BUG-010): `peak` é o maior número de trabalhos do sharp simultâneos desde o início; o teste prova que nunca passa do teto. */
export const imageJobStats = { peak: 0, waiting: () => waiting.length, running: () => running };
async function withSlot(work) {
    if (running >= MAX_CONCURRENT_IMAGE_JOBS)
        await new Promise((resolve) => waiting.push(resolve));
    else
        running += 1;
    imageJobStats.peak = Math.max(imageJobStats.peak, running);
    const release = () => {
        const next = waiting.shift();
        if (next)
            next(); // a vaga passa direto para o próximo
        else
            running -= 1;
    };
    let pending;
    try {
        pending = work();
    }
    catch (error) {
        release();
        throw error;
    }
    void pending.then(release, release);
    return pending;
}
const withTimeout = async (job) => {
    const work = withSlot(job);
    let timer;
    try {
        return await Promise.race([
            work,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new ImageRejected('A imagem demorou demais para processar.')), PROCESS_TIMEOUT_MS);
            }),
        ]);
    }
    finally {
        clearTimeout(timer);
    }
};
/** Lê só o cabeçalho (barato) e recusa antes de decodificar o que passa de 40 MP. */
export async function inspectImage(buf) {
    try {
        const meta = await withTimeout(() => sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata());
        if (!meta.width || !meta.height)
            throw new ImageRejected('Imagem inválida.');
        if (meta.width * meta.height > MAX_PIXELS)
            throw new ImageRejected('A imagem é grande demais (máximo de 40 megapixels).');
        if (meta.format === 'png' && meta.width * meta.height > MAX_PIXELS_PNG)
            throw new ImageRejected('A imagem PNG é grande demais (máximo de 25 megapixels). Envie em JPG.');
        if ((meta.pages ?? 1) > 1)
            throw new ImageRejected('Imagens animadas não são aceitas.');
        return { width: meta.width, height: meta.height };
    }
    catch (error) {
        if (error instanceof ImageRejected)
            throw error;
        throw new ImageRejected('Não foi possível ler a imagem.');
    }
}
/** WebP re-codificado: aplica a rotação do EXIF e descarta TODOS os metadados (o padrão do sharp é não copiar). */
export async function renderVariant(buf, width) {
    try {
        return await withTimeout(() => sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer());
    }
    catch (error) {
        if (error instanceof ImageRejected)
            throw error;
        throw new ImageRejected('Não foi possível processar a imagem.');
    }
}
/** Proporção largura/altura dentro da tolerância (logo 1:1, capa 16:9). */
export const ratioWithin = (info, target, tolerance) => Math.abs(info.width / info.height - target) / target <= tolerance;
/**
 * Todas as larguras com UMA decodificação do original (I8): a maior sai do original (com a rotação do EXIF) e as menores
 * derivam dela (já sem metadados). `widths` em qualquer ordem; devolve por largura.
 */
export async function renderVariants(buf, widths) {
    const sorted = [...widths].sort((a, b) => b - a);
    const out = new Map();
    const largest = sorted[0];
    if (largest === undefined)
        return out;
    const first = await renderVariant(buf, largest);
    out.set(largest, first);
    for (const width of sorted.slice(1))
        out.set(width, await renderVariant(first, width));
    return out;
}
//# sourceMappingURL=image.processor.js.map