import { type ComponentRef, type Ref } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { theme } from '../theme';

export type TextVariant = keyof typeof theme.text;
export type TextColor = keyof typeof theme.color.text;

const HEADINGS: readonly TextVariant[] = ['display', 'title1', 'title2'];
// Cartaz e números grandes (46 a 92): teto menor de fonte dinâmica (1,2) para não estourar a largura; nunca viram "cabeçalho" sozinhos.
const COMPACT: readonly TextVariant[] = ['micro', 'poster', 'celebrate', 'priceXl', 'numeralXl', 'hero', 'sticker'];

export interface TextProps extends RNTextProps {
  ref?: Ref<ComponentRef<typeof RNText>>;
  variant?: TextVariant;
  color?: TextColor;
}

/**
 * Texto do design system. Aplica estilo do token e o teto de fonte dinâmica (1,5 corpo, 1,3 títulos, 1,2 compacto),
 * que são as regras de acessibilidade do design-system.md §7. Nunca usar `fontWeight` (a família já vem por peso).
 */
export function Text({ variant = 'body', color = 'primary', style, maxFontSizeMultiplier, ref, ...rest }: TextProps) {
  const cap = HEADINGS.includes(variant)
    ? theme.maxFont.heading
    : COMPACT.includes(variant)
      ? theme.maxFont.compact
      : theme.maxFont.default;
  const base: TextStyle = { ...theme.text[variant], color: theme.color.text[color] };
  return (
    <RNText
      ref={ref}
      accessibilityRole={HEADINGS.includes(variant) && rest.accessibilityRole === undefined ? 'header' : rest.accessibilityRole}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? cap}
      style={[base, style]}
      {...rest}
    />
  );
}
