import { tokens } from '@webag/tokens';
import { hitSlopFor, maxFontSizeMultiplier, shadows, textStyles } from '@webag/tokens/native';

/**
 * Tema do app: único ponto de acesso aos tokens (docs/design/design-system.md §12).
 * Cor, espaço ou tamanho solto em componente é bug: use `theme.*`.
 */
export const theme = {
  color: tokens.color,
  space: tokens.space,
  size: tokens.size,
  radius: tokens.radius,
  borderWidth: tokens.borderWidth,
  layout: tokens.layout,
  opacity: tokens.opacity,
  motion: tokens.motion,
  zIndex: tokens.zIndex,
  text: textStyles,
  maxFont: maxFontSizeMultiplier,
  shadows,
  hitSlopFor,
} as const;

export type Theme = typeof theme;
