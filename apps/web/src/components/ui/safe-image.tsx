'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cx } from './cx';
import s from './ui.module.css';

interface Props {
  /** Sem endereço, ou com falha ao carregar, mostra o objeto da marca no lugar. */
  src: string | null | undefined;
  /** Texto alternativo real da foto. Vazio quando a foto é decorativa (o nome já está ao lado). */
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  /** Escreve "Sem foto" no lugar (miniaturas grandes). Em miniaturas pequenas só o rótulo acessível. */
  showLabel?: boolean;
  loading?: 'lazy' | 'eager';
  testId?: string;
}

/**
 * Imagem do painel que nunca mostra o ícone quebrado do navegador nem deixa o texto alternativo vazar:
 * sem `src` ou com erro de carregamento (inclusive erro anterior à hidratação), troca pelo objeto da marca (sacola, kit v3)
 * com o rótulo "Sem foto". Preenche o contêiner do pai.
 */
export function SafeImage({ src, alt, width, height, className, style, showLabel = false, loading = 'lazy', testId }: Props) {
  // Guarda o endereço que falhou: trocar o `src` volta a tentar sem precisar zerar estado em efeito.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc !== null && failedSrc === src;
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    // O erro pode ter acontecido antes de o React ligar o `onError`.
    if (img && src && img.complete && img.naturalWidth === 0 && img.currentSrc !== '') setFailedSrc(src);
  }, [src]);

  if (!src || failed) {
    return (
      <span className={cx(s.noPhoto, className)} style={style} role="img" aria-label={alt ? `Sem foto: ${alt}` : 'Sem foto'} data-testid={testId ? `${testId}-fallback` : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca */}
        <img src="/brand/webag-simbolo.svg" alt="" aria-hidden="true" className={s.noPhotoObject} />
        {showLabel ? <span className={cx('wb-text-caption', s.noPhotoLabel)}>Sem foto</span> : null}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagem pública já redimensionada pelo servidor ou prévia local (blob:)
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      className={className}
      style={style}
      onError={() => setFailedSrc(src ?? null)}
      data-testid={testId}
    />
  );
}
