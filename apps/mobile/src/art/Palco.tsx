import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { theme } from '../theme';

/** "Palco" do produto (kit/forma-palco.svg): a sacola do símbolo sem as barras, olhais na cor do fundo. Nunca atrás de texto. */
export function Palco({ size = 140, color = theme.color.brand[500], eyes = theme.color.surface.paper, rotate = -7 }: { size?: number; color?: string; eyes?: string; rotate?: number }) {
  return (
    <Svg accessibilityElementsHidden height={(size * 101) / 100} importantForAccessibility="no-hide-descendants" style={{ transform: [{ rotate: `${rotate}deg` }] }} viewBox="56 4 100 101" width={size}>
      <Polygon fill={color} points="67,43 145,43 133,95 72,95" stroke={color} strokeLinejoin="round" strokeWidth="18" />
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke={color} strokeWidth="14" />
      <Circle cx="80" cy="52" fill={eyes} r="4.5" />
      <Circle cx="132" cy="52" fill={eyes} r="4.5" />
    </Svg>
  );
}
