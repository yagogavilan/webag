import { memo, type ReactElement } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { ICON_DATA, type IconName, type SvgNode } from './solar-data';
import { svgHidden } from '../lib/a11y';

export type IconWeight = 'regular' | 'bold' | 'fill' | 'duotone';

export interface IconProps {
  size?: number;
  color?: string;
  /** regular = linear 1,5 (navegação neutra); bold/duotone = bold-duotone (marca); fill = sólido em estrela e coração (senão, bold-duotone). */
  weight?: IconWeight;
  /** Cor da camada de fundo do duotone (roxo.300 sobre claro, acento sobre noite). Sem ela, a camada usa a cor principal a 50%. */
  duo?: string;
  accessibilityLabel?: string;
}

const TAGS = { path: Path, circle: Circle, ellipse: Ellipse, rect: Rect, line: Line, polygon: Polygon, polyline: Polyline, g: G, defs: Defs, clipPath: ClipPath } as const;

const camel = (key: string) => key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function renderNode(node: SvgNode, color: string, duo: string | undefined, key: number): ReactElement | null {
  const Tag = TAGS[node.t as keyof typeof TAGS] as unknown as React.ComponentType<Record<string, unknown>> | undefined;
  if (!Tag) return null;
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.a)) {
    if (name === 'opacity' && duo) continue;
    props[camel(name)] = value === 'currentColor' ? color : value;
  }
  if (duo && node.a.opacity) {
    if (props.fill === color) props.fill = duo;
    if (props.stroke === color) props.stroke = duo;
  }
  return (
    <Tag key={key} {...props}>
      {node.k?.map((child, i) => renderNode(child, color, duo, i))}
    </Tag>
  );
}

function pick(name: IconName, weight: IconWeight) {
  const data = ICON_DATA[name];
  if (!data) return undefined;
  if (weight === 'regular') return data.l ?? data.d;
  if (weight === 'fill') return data.b ?? data.d ?? data.l;
  return data.d ?? data.l;
}

/** Ícone Solar (docs/design/direcao-v3.md §4.2). Decorativo por padrão (o rótulo vive no botão/linha que o contém). */
function SolarIcon({ name, size = 24, color = '#000', weight = 'regular', duo, accessibilityLabel }: IconProps & { name: IconName }) {
  const nodes = pick(name, weight);
  const duoColor = weight === 'regular' ? undefined : duo;
  return (
    <Svg
      accessibilityLabel={accessibilityLabel}
      height={size}
      {...svgHidden(!accessibilityLabel)}
      viewBox="0 0 24 24"
      width={size}
    >
      {nodes?.map((node, i) => renderNode(node, color, duoColor, i))}
    </Svg>
  );
}

export type IconComponent = (props: IconProps) => ReactElement;

export function makeIcon(name: IconName): IconComponent {
  const Component = memo(function NamedIcon(props: IconProps) {
    return <SolarIcon name={name} {...props} />;
  });
  Component.displayName = `Icon(${name})`;
  return Component as unknown as IconComponent;
}

export { SolarIcon };
