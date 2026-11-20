import { Platform } from 'react-native';

/**
 * Esconde um SVG decorativo do leitor de tela. No Android e no iOS valem `accessibilityElementsHidden` e
 * `importantForAccessibility`; o `react-native-svg` na web repassa essas duas props ao DOM e o React reclama
 * (o aviso cobre a tela no modo dev e bloqueia cliques, DT-067), então lá o equivalente é `aria-hidden`.
 */
export function svgHidden(hidden: boolean, platform: string = Platform.OS) {
  if (platform === 'web') return hidden ? { 'aria-hidden': true as const } : {};
  return {
    accessibilityElementsHidden: hidden,
    importantForAccessibility: (hidden ? 'no-hide-descendants' : 'yes') as 'no-hide-descendants' | 'yes',
  };
}

/** SVG que é uma imagem com rótulo (logo). Na web `accessible`/`accessibilityRole` iriam ao DOM como atributos inválidos; lá vale `role="img"`. */
export function svgImage(label: string, platform: string = Platform.OS) {
  if (platform === 'web') return { role: 'img' as const, 'aria-label': label };
  return { accessibilityLabel: label, accessibilityRole: 'image' as const, accessible: true };
}
