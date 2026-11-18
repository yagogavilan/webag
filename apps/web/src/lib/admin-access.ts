import type { AdminProfile } from './session-types';

/**
 * Matriz de menu e edição do admin (onda-1b-contas.md §AD0, alinhada a `permissions.ts` da API).
 * Só decide o que desenhar; quem barra de verdade é a API (403).
 */
export type AdminSection = 'lojas' | 'moderacao' | 'regioes' | 'categorias' | 'parametros' | 'flags' | 'termos' | 'auditoria' | 'admins';

const VIEW: Record<AdminSection, readonly AdminProfile[]> = {
  lojas: ['super_admin', 'operations', 'support'],
  moderacao: ['super_admin', 'operations', 'support'],
  regioes: ['super_admin', 'operations'],
  categorias: ['super_admin', 'operations'],
  parametros: ['super_admin'],
  flags: ['super_admin'],
  termos: ['super_admin', 'operations'],
  auditoria: ['super_admin'],
  admins: ['super_admin'],
};

const EDIT: Record<AdminSection, readonly AdminProfile[]> = {
  lojas: ['super_admin', 'operations'],
  moderacao: ['super_admin', 'operations'],
  regioes: ['super_admin', 'operations'],
  categorias: ['super_admin', 'operations'],
  parametros: ['super_admin'],
  flags: ['super_admin'],
  termos: ['super_admin'],
  auditoria: [],
  admins: ['super_admin'],
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
  { section: 'moderacao', label: 'Moderação', href: '/admin/moderacao' },
  { section: 'regioes', label: 'Regiões', href: '/admin/regioes' },
  { section: 'categorias', label: 'Categorias', href: '/admin/categorias' },
  { section: 'parametros', label: 'Parâmetros', href: '/admin/parametros' },
  { section: 'flags', label: 'Feature flags', href: '/admin/flags' },
  { section: 'termos', label: 'Termos e privacidade', href: '/admin/termos' },
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
