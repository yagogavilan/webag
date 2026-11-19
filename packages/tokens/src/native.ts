// Adaptadores para React Native (Expo). Sem dependencia de react-native: so objetos de estilo.
// Uso: import { textStyles, shadows, touchTarget } from '@webag/tokens/native';
import { tokens } from './tokens';

const { native, textStyle, size } = tokens;

export type TextStyleName = keyof typeof textStyle;

export interface NativeTextStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontVariant?: Array<'tabular-nums'>;
}

/**
 * No RN a familia varia por peso (nao usar fontWeight com fonte customizada no Android).
 * Fontes: @expo-google-fonts/figtree -> Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold.
 */
function familyForWeight(weight: number): string {
  if (weight >= 800) return native.fontFamily.extrabold;
  if (weight >= 700) return native.fontFamily.bold;
  if (weight >= 600) return native.fontFamily.semibold;
  return native.fontFamily.regular;
}

/** Bricolage Grotesque (titulos, numeros de marca): @expo-google-fonts/bricolage-grotesque -> _600SemiBold, _700Bold, _800ExtraBold. */
function displayFamilyForWeight(weight: number): string {
  if (weight >= 800) return native.fontFamily.displayExtraBold;
  if (weight >= 700) return native.fontFamily.displayBold;
  if (weight >= 600) return native.fontFamily.displaySemibold;
  return native.fontFamily.displayMedium;
}

function toNative(style: (typeof textStyle)[TextStyleName]): NativeTextStyle {
  const base: NativeTextStyle = {
    fontFamily: style.family === 'display' ? displayFamilyForWeight(style.weight) : familyForWeight(style.weight),
    fontSize: style.size,
    lineHeight: style.lineHeight,
  };
  return style.tabular ? { ...base, fontVariant: ['tabular-nums'] } : base;
}

export const textStyles: Record<TextStyleName, NativeTextStyle> = {
  hero: toNative(textStyle.hero),
  display: toNative(textStyle.display),
  title1: toNative(textStyle.title1),
  title2: toNative(textStyle.title2),
  body: toNative(textStyle.body),
  bodyStrong: toNative(textStyle.bodyStrong),
  label: toNative(textStyle.label),
  caption: toNative(textStyle.caption),
  captionStrong: toNative(textStyle.captionStrong),
  micro: toNative(textStyle.micro),
  price: toNative(textStyle.price),
  numeral: toNative(textStyle.numeral),
  numeralBrand: toNative(textStyle.numeralBrand),
  poster: toNative(textStyle.poster),
  celebrate: toNative(textStyle.celebrate),
  priceXl: toNative(textStyle.priceXl),
  numeralXl: toNative(textStyle.numeralXl),
  priceStrong: toNative(textStyle.priceStrong),
  sticker: toNative(textStyle.sticker),
};

/**
 * Escala maxima da fonte do sistema (Dynamic Type / escala de fonte do Android).
 * Passar em <Text maxFontSizeMultiplier={...}>. Layouts nunca usam altura fixa para texto.
 */
export const maxFontSizeMultiplier = native.maxFontSizeMultiplier;

export interface NativeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

// CSS usa "blur" (2x sigma); shadowRadius do RN equivale aproximadamente a blur / 2.
function toShadow(level: keyof typeof native.shadow): NativeShadow {
  const s = native.shadow[level];
  return {
    shadowColor: native.shadowColor,
    shadowOffset: { width: 0, height: s.offsetY },
    shadowOpacity: s.opacity,
    shadowRadius: s.blur / 2,
    elevation: s.elevation,
  };
}

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } satisfies NativeShadow,
  sm: toShadow('sm'),
  md: toShadow('md'),
  lg: toShadow('lg'),
};

/** Sombra "dura" do adesivo (direcao v3): deslocada, sem desfoque. Em RN e uma copia deslocada do elemento (ver Sticker). */
export const hardShadow = { offset: native.shadowHard.offset, offsetLg: native.shadowHard.offsetLg } as const;

/** Molas do movimento da marca (Reanimated withSpring). */
export const springs = native.spring;

/** Alvo de toque minimo: 48dp (Material) cobre tambem os 44pt da Apple. */
export const touchTarget = { minWidth: size.touchMin, minHeight: size.touchMin } as const;

/** hitSlop para estender a area de toque de icones menores que 48 (ex.: 24 -> 48). */
export function hitSlopFor(visibleSize: number): { top: number; bottom: number; left: number; right: number } {
  const extra = Math.max(0, Math.ceil((size.touchMin - visibleSize) / 2));
  return { top: extra, bottom: extra, left: extra, right: extra };
}

/** Curvas para Easing.bezier(...easing.standard) do react-native / Reanimated. */
export const easing = native.easing;

/** Nomes semanticos de haptics mapeados para expo-haptics. */
export const haptics = native.haptics;

export const duration = tokens.motion.duration;
