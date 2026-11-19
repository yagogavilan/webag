import Svg, { Path } from 'react-native-svg';
import type { IconComponent } from './Icon';
import { svgHidden } from '../lib/a11y';

/** Sinais simples (a Solar não tem "+", "-", "x" e "ok" soltos): traço arredondado 2,2 na grade 24. */
function basic(d: string): IconComponent {
  return function BasicIcon({ size = 24, color = '#000', weight = 'regular' }) {
    return (
      <Svg height={size} {...svgHidden(true)} viewBox="0 0 24 24" width={size}>
        <Path d={d} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={weight === 'regular' ? 2 : 2.8} />
      </Svg>
    );
  };
}

export const Plus = basic('M12 5V19M5 12H19');
export const Minus = basic('M5 12H19');
export const Check = basic('M5 12.5L10 17.5L19 7');
export const X = basic('M6 6L18 18M18 6L6 18');
