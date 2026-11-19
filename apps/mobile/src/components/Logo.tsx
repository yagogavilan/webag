import Svg, { Circle, Defs, G, Mask, Path, Polygon, Rect } from 'react-native-svg';
import { theme } from '../theme';
import { LOGO_VIEWBOX, WORDMARK_PATHS } from './logo-paths';

export interface LogoProps {
  /** `full` = símbolo + nome; `symbol` = só o símbolo (sacola com linhas de velocidade). */
  variant?: 'full' | 'symbol';
  /** `brand` sobre fundo claro; `onBrand` (branca) sobre roxo ou foto com scrim. */
  tone?: 'brand' | 'onBrand';
  /** Altura em dp. A largura segue a proporção da arte. */
  height?: number;
  accessibilityLabel?: string;
}

/** Símbolo v4a (Sacola Trapézio) e logo horizontal. Fonte: docs/design/logo/webag-simbolo.svg e webag-logo.svg. */
export function Logo({ variant = 'full', tone = 'brand', height = 32, accessibilityLabel = 'Webag' }: LogoProps) {
  const fill = tone === 'brand' ? theme.color.brand[500] : theme.color.neutral[0];
  // Logo colorida: símbolo na cor de marca, palavra na cor de ação (6,04:1 sobre branco).
  const wordFill = tone === 'brand' ? theme.color.action.primary : fill;
  const symbolOnly = variant === 'symbol';
  const viewBox = symbolOnly ? '0 0 160 104' : `0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`;
  const ratio = symbolOnly ? 160 / 104 : LOGO_VIEWBOX.width / LOGO_VIEWBOX.height;
  return (
    <Svg
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      accessible
      height={height}
      viewBox={viewBox}
      width={height * ratio}
    >
      <Defs>
        <Mask id="wb-olhais" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="104">
          <Rect x="0" y="0" width="160" height="104" fill="#FFFFFF" />
          <Circle cx="80" cy="52" r="4.5" fill="#000000" />
          <Circle cx="132" cy="52" r="4.5" fill="#000000" />
        </Mask>
      </Defs>
      <G>
        <G fill={fill}>
          <Rect x="24" y="34" width="23" height="14" rx="7" />
          <Rect x="0" y="62" width="49" height="14" rx="7" />
          <Rect x="18" y="90" width="34" height="14" rx="7" />
        </G>
        <G fill={fill} mask="url(#wb-olhais)">
          <Polygon points="67,43 145,43 133,95 72,95" stroke={fill} strokeWidth={18} strokeLinejoin="round" />
          <Path d="M80 42 A26 30 0 0 1 132 42" fill="none" stroke={fill} strokeWidth={14} />
        </G>
      </G>
      {symbolOnly ? null : (
        <G fill={wordFill}>
          {WORDMARK_PATHS.map((d, i) => (
            <Path key={i} d={d} />
          ))}
        </G>
      )}
    </Svg>
  );
}
