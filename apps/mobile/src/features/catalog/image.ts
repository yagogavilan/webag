import { PixelRatio } from 'react-native';
import { artColorFor, objectFor } from '../../art/ProductArt';
import type { ImageFallback } from '../../components/RemoteImage';
import { theme } from '../../theme';

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

/** Produto sem foto (ou foto que não carregou): a peça do kit v3 da categoria/nome, na cor estável do nome. `onInk` = sobre a faixa noite. */
export function productFallback(name: string, onInk = false): ImageFallback {
  const art = objectFor(name);
  return onInk
    ? { art, seed: name, color: '#C7CCD3', ground: 'rgba(0, 0, 0, 0.4)', background: theme.color.neutral[800] }
    : { art, seed: name, color: artColorFor(name) };
}

/** Logo de loja sem foto: iniciais na cor da loja (kit-marca-v3.md §4), em vez de um quadrado cinza com ícone. */
export function logoFallback(name: string, color: string): ImageFallback {
  const words = name.split(/\s+/).filter(Boolean);
  return { initials: ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase(), color };
}
