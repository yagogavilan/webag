/**
 * Páginas públicas do site (sem login, no host público). Sem importar nada de servidor: o proxy e os testes usam esta lista.
 * `/pagar/*` tem CSP própria (Mercado Pago) e fica de fora.
 */
export const PUBLIC_SITE_PATHS = ['/', '/excluir-conta', '/privacidade', '/termos', '/ajuda', '/suporte', '/licencas'] as const;

export function isPublicSitePath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC_SITE_PATHS.some((p) => path === p || (p !== '/' && path.startsWith(`${p}/`)));
}
