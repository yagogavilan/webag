import { PixelRatio } from 'react-native';

/**
 * A API devolve as imagens como `{ urls: { "<largura px>": "<url WebP>" } }`. Escolhe a menor que cobre a largura pedida na densidade
 * da tela (limitada a 2x: 3x gasta dado em 3G sem ganho visível), ou a maior disponível. Vazio = sem imagem (placeholder).
 */
export function pickImageUrl(urls: Record<string, string> | undefined, widthDp: number): string | undefined {
  if (!urls) return undefined;
  const entries = Object.entries(urls)
    .map(([width, url]) => ({ width: Number(width), url }))
    .filter((e) => Number.isFinite(e.width) && e.url)
    .sort((a, b) => a.width - b.width);
  if (entries.length === 0) return undefined;
  const wanted = widthDp * Math.min(PixelRatio.get(), 2);
  return (entries.find((e) => e.width >= wanted) ?? entries[entries.length - 1])?.url;
}
