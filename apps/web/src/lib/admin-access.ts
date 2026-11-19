import type { AdminProfile } from './session-types';

/**
 * Matriz de menu e edição do admin (onda-1b-contas.md §AD0, alinhada a `permissions.ts` da API).
 * Só decide o que desenhar; quem barra de verdade é a API (403).
 */
export type AdminSection = 'lojas' | 'logistica' | 'estornos' | 'frete' | 'comissoes' | 'trocas' | 'moderacao' | 'regioes' | 'categorias' | 'parametros' | 'flags' | 'termos' | 'auditoria' | 'admins' | 'banners' | 'push' | 'cupons' | 'relatorios' | 'denuncias' | 'ajuda' | 'titulares' | 'disputas';

const VIEW: Record<AdminSection, readonly AdminProfile[]> = {
  lojas: ['super_admin', 'operations', 'support'],
  logistica: ['super_admin', 'operations', 'finance', 'support'],
  estornos: ['super_admin', 'finance'],
  frete: ['super_admin', 'operations', 'finance'],
  comissoes: ['super_admin', 'finance'],
  trocas: ['super_admin', 'operations', 'finance'],
  moderacao: ['super_admin', 'operations', 'support'],
  regioes: ['super_admin', 'operations'],
  categorias: ['super_admin', 'operations'],
  parametros: ['super_admin'],
  flags: ['super_admin'],
  termos: ['super_admin', 'operations'],
  auditoria: ['super_admin'],
  admins: ['super_admin'],
  // Onda 6. Marketing: financeiro e suporte não veem (MK1, MK2); cupons: financeiro lê (WB-116).
  banners: ['super_admin', 'operations'],
  push: ['super_admin', 'operations'],
  cupons: ['super_admin', 'operations', 'finance'],
  relatorios: ['super_admin', 'operations', 'finance'],
  denuncias: ['super_admin', 'operations'],
  ajuda: ['super_admin', 'operations'],
  titulares: ['super_admin'],
  disputas: ['super_admin', 'operations'],
};

const EDIT: Record<AdminSection, readonly AdminProfile[]> = {
  lojas: ['super_admin', 'operations'],
  logistica: ['super_admin', 'operations'],
  estornos: ['super_admin', 'finance'],
  frete: ['super_admin', 'finance'],
  comissoes: ['super_admin', 'finance'],
  trocas: [],
  moderacao: ['super_admin', 'operations'],
  regioes: ['super_admin', 'operations'],
  categorias: ['super_admin', 'operations'],
  parametros: ['super_admin'],
  flags: ['super_admin'],
  termos: ['super_admin'],
  auditoria: [],
  admins: ['super_admin'],
  banners: ['super_admin', 'operations'],
  push: ['super_admin', 'operations'],
  cupons: ['super_admin', 'operations'],
  relatorios: [],
  denuncias: ['super_admin', 'operations'],
  ajuda: ['super_admin', 'operations'],
  titulares: ['super_admin'],
  disputas: ['super_admin', 'operations'],
};

export function canView(profile: AdminProfile | null, section: AdminSection): boolean {
  return profile !== null && VIEW[section].includes(profile);
}

export function canEdit(profile: AdminProfile | null, section: AdminSection): boolean {
  return profile !== null && EDIT[section].includes(profile);
}

/** Documentos de identidade das lojas (WB-218 C1): só super admin e operação; o suporte vê os dados sem a aba Documentos. */
export function canOpenStoreDocuments(profile: AdminProfile | null): boolean {
  return profile === 'super_admin' || profile === 'operations';
}

export const PROFILE_LABEL: Record<AdminProfile, string> = {
  super_admin: 'Super admin',
  operations: 'Operação',
  finance: 'Financeiro',
  support: 'Suporte',
};

export const PROFILE_DESCRIPTION: Record<AdminProfile, string> = {
  super_admin: 'Tudo, inclusive admins, parâmetros e flags',
  operations: 'Lojas, catálogo, pedidos, marketing e regiões',
  finance: 'Comissões, repasses, conciliação e estornos',
  support: 'Consulta pedidos, lojas e usuários e abre trocas',
};

export interface NavItem {
  section: AdminSection;
  label: string;
  href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { section: 'lojas', label: 'Lojas', href: '/admin/lojas' },
  { section: 'logistica', label: 'Logística', href: '/admin/logistica' },
  { section: 'estornos', label: 'Estornos', href: '/admin/estornos' },
  { section: 'frete', label: 'Frete por região', href: '/admin/frete' },
  { section: 'comissoes', label: 'Comissões', href: '/admin/comissoes' },
  { section: 'trocas', label: 'Relatório de trocas', href: '/admin/trocas' },
  { section: 'disputas', label: 'Disputas de troca', href: '/admin/disputas' },
  { section: 'relatorios', label: 'Relatórios', href: '/admin/relatorios' },
  { section: 'banners', label: 'Banners e destaques', href: '/admin/banners' },
  { section: 'push', label: 'Push segmentado', href: '/admin/push' },
  { section: 'cupons', label: 'Cupons da plataforma', href: '/admin/cupons' },
  { section: 'moderacao', label: 'Moderação', href: '/admin/moderacao' },
  { section: 'denuncias', label: 'Denúncias', href: '/admin/denuncias' },
  { section: 'ajuda', label: 'Ajuda', href: '/admin/ajuda' },
  { section: 'regioes', label: 'Regiões', href: '/admin/regioes' },
  { section: 'categorias', label: 'Categorias', href: '/admin/categorias' },
  { section: 'parametros', label: 'Parâmetros', href: '/admin/parametros' },
  { section: 'flags', label: 'Feature flags', href: '/admin/flags' },
  { section: 'termos', label: 'Termos e privacidade', href: '/admin/termos' },
  { section: 'titulares', label: 'Pedidos de titulares', href: '/admin/titulares' },
  { section: 'auditoria', label: 'Auditoria', href: '/admin/auditoria' },
  { section: 'admins', label: 'Admins e perfis', href: '/admin/admins' },
];

export function visibleNav(profile: AdminProfile | null): NavItem[] {
  return NAV_ITEMS.filter((item) => canView(profile, item.section));
}

/** Destino pós-login seguro: só caminhos internos do admin (evita open redirect). */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/admin') || value.startsWith('//') || value.includes('\\')) return null;
  if (value.startsWith('/admin/entrar') || value.startsWith('/admin/convite')) return null;
  return value;
}
