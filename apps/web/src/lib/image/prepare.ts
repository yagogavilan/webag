/**
 * Preparação de imagem no navegador antes do envio (WB-052 C1/C4, ADR-005): valida tipo e tamanho, corrige a orientação,
 * recorta, reduz e recodifica em JPEG. Recodificar também apaga os metadados (EXIF e GPS ficam no aparelho).
 * As contas de geometria são funções puras (testadas em jsdom); o canvas só roda no navegador.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const DOCUMENT_HINT = 'JPG, PNG ou PDF, até 5 MB';
/** Lado maior da imagem enviada e qualidade do JPEG: legível para conferir documento, leve em 3G. */
export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.82;
/** Luminância média (0 a 255) abaixo da qual avisamos "foto escura" [HIPÓTESE: limiar simples, onda-2 Z-6]. */
export const DARK_THRESHOLD = 55;

export function isPdf(file: { type: string; name: string }): boolean {
  return file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name));
}

export function isImage(file: { type: string; name: string }): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png' || (file.type === '' && /\.(jpe?g|png)$/i.test(file.name));
}

/** Motivo da recusa, ou `null` se o arquivo serve (onda-2 L5: mostrado antes de enviar). */
export function validateDocumentFile(file: { type: string; name: string; size: number }): string | null {
  if (!isPdf(file) && !isImage(file)) return 'Use uma foto (JPG ou PNG) ou PDF.';
  if (file.size > MAX_FILE_BYTES) return `Esse arquivo tem ${(file.size / (1024 * 1024)).toFixed(0)} MB. O máximo é 5 MB.`;
  if (file.size === 0) return 'Esse arquivo está vazio. Escolha outro.';
  return null;
}

/** Foto de logo ou capa: JPG, PNG ou WebP, até 5 MB (onda-2 C2). */
export function validateStoreImage(file: { type: string; name: string; size: number }): string | null {
  const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || (file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name));
  if (!ok) return 'Use uma foto JPG, PNG ou WebP.';
  if (file.size > MAX_FILE_BYTES) return `Esse arquivo tem ${(file.size / (1024 * 1024)).toFixed(0)} MB. O máximo é 5 MB.`;
  if (file.size === 0) return 'Esse arquivo está vazio. Escolha outro.';
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Média da luminância percebida (Rec. 601) de um `ImageData.data` (RGBA). */
export function averageLuminance(data: ArrayLike<number>): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    sum += 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    count += 1;
  }
  return count === 0 ? 255 : sum / count;
}

export interface CropView {
  /** Tamanho da imagem (já girada) e da moldura, em pixels. */
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  /** 1 = a imagem cobre a moldura; maior aproxima. */
  zoom: number;
  /** Posição do canto superior esquerdo da imagem dentro da moldura (≤ 0 quando cobre). */
  offsetX: number;
  offsetY: number;
}

/** Escala de exibição: a imagem sempre cobre a moldura em zoom 1 (nunca aparece vazio). */
export function displayScale(view: Pick<CropView, 'imageWidth' | 'imageHeight' | 'frameWidth' | 'frameHeight' | 'zoom'>): number {
  return Math.max(view.frameWidth / view.imageWidth, view.frameHeight / view.imageHeight) * view.zoom;
}

/** Mantém a imagem cobrindo a moldura: o deslocamento nunca deixa borda vazia. */
export function clampOffset(view: CropView): { offsetX: number; offsetY: number } {
  const scale = displayScale(view);
  const minX = Math.min(0, view.frameWidth - view.imageWidth * scale);
  const minY = Math.min(0, view.frameHeight - view.imageHeight * scale);
  return { offsetX: Math.min(0, Math.max(minX, view.offsetX)), offsetY: Math.min(0, Math.max(minY, view.offsetY)) };
}

/** Retângulo da imagem original que aparece dentro da moldura. */
export function cropRect(view: CropView): { x: number; y: number; width: number; height: number } {
  const scale = displayScale(view);
  const { offsetX, offsetY } = clampOffset(view);
  return {
    x: Math.max(0, -offsetX / scale),
    y: Math.max(0, -offsetY / scale),
    width: Math.min(view.imageWidth, view.frameWidth / scale),
    height: Math.min(view.imageHeight, view.frameHeight / scale),
  };
}

/** Troca de zoom mantendo o centro da moldura no mesmo ponto da imagem. */
export function zoomAround(view: CropView, nextZoom: number): CropView {
  const zoom = Math.min(4, Math.max(1, nextZoom));
  const before = displayScale(view);
  const after = displayScale({ ...view, zoom });
  const cx = (view.frameWidth / 2 - view.offsetX) / before;
  const cy = (view.frameHeight / 2 - view.offsetY) / before;
  const moved = { ...view, zoom, offsetX: view.frameWidth / 2 - cx * after, offsetY: view.frameHeight / 2 - cy * after };
  return { ...moved, ...clampOffset(moved) };
}

export type Quarter = 0 | 1 | 2 | 3;

/** Decodifica respeitando a orientação EXIF (foto de celular de lado). */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/** Desenha a imagem girada em `quarter` quartos de volta (sentido horário). */
export function drawRotated(source: ImageBitmap | HTMLCanvasElement, quarter: Quarter): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const swap = quarter % 2 === 1;
  canvas.width = swap ? source.height : source.width;
  canvas.height = swap ? source.width : source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarter * Math.PI) / 2);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('falha ao comprimir'))), 'image/jpeg', quality));
}

export function cropToCanvas(source: HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }, maxSide = MAX_SIDE): HTMLCanvasElement {
  const size = fitWithin(Math.round(rect.width), Math.round(rect.height), maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
  return canvas;
}

export interface Prepared {
  blob: Blob;
  width: number;
  height: number;
  /** A foto ficou escura demais para conferir (só aviso). */
  dark: boolean;
}

/** Reduz e recodifica a foto inteira (sem recorte): o caminho mais comum de "Usar esta". */
export async function compressImage(file: Blob, quarter: Quarter = 0): Promise<Prepared> {
  const bitmap = await decodeImage(file);
  const rotated = drawRotated(bitmap, quarter);
  bitmap.close();
  const canvas = cropToCanvas(rotated, { x: 0, y: 0, width: rotated.width, height: rotated.height });
  return finish(canvas);
}

/**
 * Teto de bytes da foto de produto (onda-2 K2: saída até 300 KB). Baixa a qualidade do JPEG por degraus e, se ainda
 * passar, reduz o lado em 15% e repete; para no mínimo de 480 px para a foto não virar borrão.
 */
export const PRODUCT_PHOTO_MAX_BYTES = 300 * 1024;
export const PRODUCT_PHOTO_MAX_SIDE = 1600;
const QUALITY_STEPS = [JPEG_QUALITY, 0.72, 0.62, 0.52] as const;

export async function encodeWithin(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  let current = canvas;
  for (;;) {
    let blob = await canvasToJpeg(current, QUALITY_STEPS[0]);
    for (const quality of QUALITY_STEPS.slice(1)) {
      if (blob.size <= maxBytes) break;
      blob = await canvasToJpeg(current, quality);
    }
    if (blob.size <= maxBytes || Math.max(current.width, current.height) <= 480) return blob;
    current = cropToCanvas(current, { x: 0, y: 0, width: current.width, height: current.height }, Math.round(Math.max(current.width, current.height) * 0.85));
  }
}

export async function finish(canvas: HTMLCanvasElement, maxBytes?: number): Promise<Prepared> {
  const blob = maxBytes ? await encodeWithin(canvas, maxBytes) : await canvasToJpeg(canvas);
  return { blob, width: canvas.width, height: canvas.height, dark: isDark(canvas) };
}

function isDark(canvas: HTMLCanvasElement): boolean {
  const probe = cropToCanvas(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height }, 64);
  const data = probe.getContext('2d')?.getImageData(0, 0, probe.width, probe.height).data;
  return data ? averageLuminance(data) < DARK_THRESHOLD : false;
}
