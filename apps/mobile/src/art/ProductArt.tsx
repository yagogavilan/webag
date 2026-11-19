import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { theme } from '../theme';
import { OBJECT_DATA, type ArtShape, type ObjectName } from './objects-data';
import { tones } from './tones';
import { svgHidden } from '../lib/a11y';

export interface ProductArtProps {
  name: ObjectName;
  /** Cor base do produto (a variação escolhida troca a peça de cor). */
  color: string;
  /** Acento do contexto (barras do tênis, fruta da cesta). */
  accent?: string;
  /** Sombra de chão: padrão noite a 16%; sobre fundo escuro, passe uma mais forte; 'transparent' dentro de ilustração. */
  ground?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const FIXED: Record<string, string> = { k: '#2C2632', n: '#443C4C', w: '#FFFFFF', m: '#C9A24A', v: '#4A6630', vl: '#6E8F47' };

function renderShape(shape: ArtShape, i: number, palette: Record<string, string>) {
  const fill = (t: string) => palette[t] ?? FIXED[t] ?? '#000';
  switch (shape[0]) {
    case 'P':
      return <Path key={i} d={shape[2]} fill={fill(shape[1])} stroke={fill(shape[1])} strokeLinejoin="round" strokeWidth={shape[3]} />;
    case 'L':
      return <Path key={i} d={shape[2]} fill="none" stroke={fill(shape[1])} strokeLinecap="round" strokeLinejoin="round" strokeWidth={shape[3]} />;
    case 'R':
      return <Rect key={i} fill={fill(shape[1])} height={shape[5]} rx={shape[6]} width={shape[4]} x={shape[2]} y={shape[3]} />;
    case 'C':
      return <Circle key={i} cx={shape[2]} cy={shape[3]} fill={fill(shape[1])} r={shape[4]} />;
    case 'E':
      return (
        <Ellipse key={i} cx={shape[2]} cy={shape[3]} fill={fill(shape[1])} rx={shape[4]} ry={shape[5]} transform={shape[6] ? `rotate(${shape[6]} ${shape[2]} ${shape[3]})` : undefined} />
      );
  }
}

/** Objeto de produto do kit v3 (12 peças, geométricas e sólidas), usado onde ainda não há foto. Decorativo salvo `accessibilityLabel`. */
export const ProductArt = memo(function ProductArt({ name, color, accent, ground = 'rgba(28, 23, 33, 0.16)', size = 120, style, accessibilityLabel }: ProductArtProps) {
  const data = OBJECT_DATA[name];
  if (!data) return null;
  const t = tones(color);
  const palette = { b: color, s: t.shade, h: t.light, x: accent ?? theme.color.accent.base, g: ground };
  return (
    <Svg
      accessibilityLabel={accessibilityLabel}
      height={size}
      {...svgHidden(!accessibilityLabel)}
      style={style}
      viewBox="0 0 200 200"
      width={size}
    >
      <G>{data.shapes.map((shape, i) => renderShape(shape, i, palette))}</G>
    </Svg>
  );
});

/** Objeto por rótulo livre (nome da categoria, nome do produto). Palavras conhecidas viram a peça certa; o resto cai na sacola neutra (cesta). */
const KEYWORDS: [RegExp, ObjectName][] = [
  [/tenis|sneaker|cal[cç]ado|sapato|chinelo/i, 'sneaker'],
  [/camis|blusa|t-shirt|moda|roupa|regata/i, 'tee'],
  [/vestido/i, 'dress'],
  [/bolsa|mochila|handbag|shopping-bag|acess/i, 'purse'],
  [/cal[cç]a|jeans|bermuda/i, 'jeans'],
  [/perfum|beleza|cosm|sparkle|cuidado/i, 'perfume'],
  [/fone|headphone|eletr|celular|device|laptop|televis|tecnolog/i, 'phones'],
  [/vaso|plant|flor|casa|decor|armchair|house|lightbulb|jardim|m[oó]vel/i, 'vase'],
  [/caderno|livro|papel|pencil|book|escola|backpack|brinq|game|baby/i, 'notebook'],
  [/ra[cç][aã]o|pet|dog|paw/i, 'racao'],
  [/cesta|mercad|basket|fruta|aliment|carrot|bread|pizza|bebida|cake|coffee|cooking|storefront/i, 'cesta'],
  [/rel[oó]gio|watch|diamond|joia/i, 'relogio'],
];
export function objectFor(label: string): ObjectName {
  for (const [re, obj] of KEYWORDS) if (re.test(label)) return obj;
  return 'cesta';
}
