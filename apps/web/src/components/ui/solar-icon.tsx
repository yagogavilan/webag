import { createElement, type ReactElement } from 'react';
import { ICON_DATA, type SolarName, type SvgNode } from './solar-data';
import s from './ui.module.css';

/**
 * Ícone Solar (480 Design, CC BY 4.0; crédito em `/licencas`). Linear 1,8 na navegação e nas ações; `duotone` (bold-duotone) só como
 * metadado de marca (relógio, moto, sino, alerta), com a camada de fundo em `duo`. Decorativo por padrão (`aria-hidden`): o rótulo
 * vem do texto ao lado ou do `aria-label` do botão. Sem `dangerouslySetInnerHTML`: o desenho vem de dados estáticos gerados.
 */
const camel = (key: string) => key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function node(n: SvgNode, key: number, duo: string | undefined): ReactElement {
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(n.a)) {
    if (name === 'opacity' && duo) continue;
    props[camel(name)] = value;
  }
  if (duo && n.a.opacity) {
    if (n.a.fill === 'currentColor') props.fill = duo;
    if (n.a.stroke === 'currentColor') props.stroke = duo;
  }
  return createElement(n.t, props, ...(n.k ?? []).map((child, i) => node(child, i, duo)));
}

export function SolarIcon({ name, size = 24, duotone = false, duo, className }: { name: SolarName; size?: number; duotone?: boolean; duo?: string; className?: string }) {
  const data = ICON_DATA[name];
  const tree = (duotone ? data?.d : data?.l) ?? data?.l ?? data?.d ?? [];
  return (
    <svg className={[s.solar, className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {tree.map((n, i) => node(n, i, duotone ? duo : undefined))}
    </svg>
  );
}
