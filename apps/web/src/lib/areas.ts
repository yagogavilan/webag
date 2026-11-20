/**
 * Áreas do app web (DEC-005, ADR-001): lojista e admin no mesmo deploy, separadas por rota e papel.
 * A guarda de rota (quando a autenticação existir, ADR-003) usa `areaForPath` para decidir o papel exigido.
 * Isto só evita renderizar a área errada: a autorização de verdade é sempre na API.
 */
export type PanelAreaId = 'lojista' | 'admin';

export interface PanelArea {
  id: PanelAreaId;
  basePath: `/${PanelAreaId}`;
  title: string;
  requiredRole: 'merchant' | 'admin';
}

export const PANEL_AREAS: Readonly<Record<PanelAreaId, PanelArea>> = {
  lojista: { id: 'lojista', basePath: '/lojista', title: 'Painel da loja', requiredRole: 'merchant' },
  admin: { id: 'admin', basePath: '/admin', title: 'Administração', requiredRole: 'admin' },
};

export function areaForPath(pathname: string): PanelArea | undefined {
  return Object.values(PANEL_AREAS).find(
    (area) => pathname === area.basePath || pathname.startsWith(`${area.basePath}/`),
  );
}
