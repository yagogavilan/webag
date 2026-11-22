import type { AdminProfile } from './session-types';

/**
 * Matriz de menu e edição do admin (onda-1b-contas.md §AD0, alinhada a `permissions.ts` da API).
 * Só decide o que desenhar; quem barra de verdade é a API (403).
 */
export type AdminSection = 'inicio' | 'lojas' | 'logistica' | 'estornos' | 'frete' | 'comissoes' | 'trocas' | 'moderacao' | 'regioes' | 'categorias' | 'parametros' | 'parametros_entrega' | 'flags' | 'termos' | 'auditoria' | 'admins' | 'banners' | 'push' | 'cupons' | 'relatorios' | 'denuncias' | 'ajuda' | 'titulares' | 'disputas' | 'alertas' | 'pedidos' | 'usuarios' | 'manutencao';

const ALL_PROFILES: readonly AdminProfile[] = ['super_admin', 'operations', 'finance', 'support'];

const VIEW: Record<AdminSection, readonly AdminProfile[]> = {
  inicio: ALL_PROFILES,
  // WB-355 / v1.1 R1: os 4 perfis veem a ficha, o histórico e o "Ver como" (stores:read, view-as:open); editar é de super admin e operação.
  lojas: ['super_admin', 'operations', 'finance', 'support'],
  logistica: ['super_admin', 'operations', 'finance', 'support'],
  estornos: ['super_admin', 'finance'],
  frete: ['super_admin', 'operations', 'finance'],
  comissoes: ['super_admin', 'finance'],
  trocas: ['super_admin', 'operations', 'finance'],
  moderacao: ['super_admin', 'operations', 'support'],
  regioes: ['super_admin', 'operations'],
  categorias: ['super_admin', 'operations'],
  parametros: ['super_admin'],
  parametros_entrega: ['super_admin'],
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
  // B3, B4, B5, WB-121 (DEC-073/074). Alertas: todo perfil lê, mas a API só devolve os TIPOS do público do perfil. Usuários: suporte lê sem bloquear.
  alertas: ALL_PROFILES,
  pedidos: ALL_PROFILES,
  usuarios: ['super_admin', 'operations', 'support'],
  manutencao: ['super_admin'],
};

const EDIT: Record<AdminSection, readonly AdminProfile[]> = {
  inicio: [],
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
  parametros_entrega: ['super_admin'],
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
  // Encerrar alerta: `alerts:resolve`. Pedidos: cancelar e estornar são do financeiro e do super admin (DEC-074c); operação e suporte só leem.
  alertas: ['super_admin', 'operations', 'finance'],
  pedidos: ['super_admin', 'finance'],
  usuarios: ['super_admin', 'operations'],
  manutencao: ['super_admin'],
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

export type NavGroupId = 'operation' | 'money' | 'marketing' | 'area' | 'system';

export const NAV_GROUP_LABEL: Record<NavGroupId, string> = {
  operation: 'Operação',
  money: 'Dinheiro e dados',
  marketing: 'Marketing',
  area: 'Área e catálogo',
  system: 'Sistema',
};

export interface NavItem {
  section: AdminSection;
  label: string;
  /** Rótulo curto na barra de baixo do celular. */
  shortLabel?: string;
  href: string;
  group: NavGroupId;
}

/** Ordem = ordem da barra lateral (`onda-7-navegacao-paineis.md` §3.2 e protótipo). */
export const NAV_ITEMS: readonly NavItem[] = [
  { section: 'inicio', label: 'Início', href: '/admin', group: 'operation' },
  { section: 'alertas', label: 'Alertas', href: '/admin/alertas', group: 'operation' },
  { section: 'logistica', label: 'Logística', href: '/admin/logistica', group: 'operation' },
  { section: 'pedidos', label: 'Pedidos', href: '/admin/pedidos', group: 'operation' },
  { section: 'lojas', label: 'Lojas', href: '/admin/lojas', group: 'operation' },
  { section: 'usuarios', label: 'Usuários', href: '/admin/usuarios', group: 'operation' },
  { section: 'disputas', label: 'Disputas de troca', shortLabel: 'Disputas', href: '/admin/disputas', group: 'operation' },
  { section: 'estornos', label: 'Estornos', href: '/admin/estornos', group: 'operation' },
  { section: 'moderacao', label: 'Moderação', href: '/admin/moderacao', group: 'operation' },
  { section: 'denuncias', label: 'Denúncias', href: '/admin/denuncias', group: 'operation' },
  { section: 'ajuda', label: 'Ajuda', href: '/admin/ajuda', group: 'operation' },
  { section: 'comissoes', label: 'Comissões', href: '/admin/comissoes', group: 'money' },
  { section: 'frete', label: 'Frete por região', href: '/admin/frete', group: 'money' },
  { section: 'relatorios', label: 'Relatórios', href: '/admin/relatorios', group: 'money' },
  { section: 'trocas', label: 'Relatório de trocas', href: '/admin/trocas', group: 'money' },
  { section: 'banners', label: 'Banners e destaques', href: '/admin/banners', group: 'marketing' },
  { section: 'cupons', label: 'Cupons da plataforma', href: '/admin/cupons', group: 'marketing' },
  { section: 'push', label: 'Push segmentado', href: '/admin/push', group: 'marketing' },
  { section: 'regioes', label: 'Regiões', href: '/admin/regioes', group: 'area' },
  { section: 'categorias', label: 'Categorias', href: '/admin/categorias', group: 'area' },
  { section: 'parametros_entrega', label: 'Parâmetros de entrega', shortLabel: 'Parâmetros', href: '/admin/parametros/entrega', group: 'system' },
  { section: 'parametros', label: 'Todos os parâmetros', href: '/admin/parametros', group: 'system' },
  { section: 'manutencao', label: 'Modo manutenção', shortLabel: 'Manutenção', href: '/admin/manutencao', group: 'system' },
  { section: 'flags', label: 'Feature flags', href: '/admin/flags', group: 'system' },
  { section: 'termos', label: 'Termos e privacidade', href: '/admin/termos', group: 'system' },
  { section: 'titulares', label: 'Pedidos de titulares', href: '/admin/titulares', group: 'system' },
  { section: 'auditoria', label: 'Auditoria', href: '/admin/auditoria', group: 'system' },
  { section: 'admins', label: 'Admins e perfis', href: '/admin/admins', group: 'system' },
];

/**
 * Destinos fixos da barra de baixo do celular por perfil (`onda-7-navegacao-paineis.md` §3.2). Posição estável, não muda com uso nem
 * contagem; o que o perfil não enxerga é ignorado (a barra mostra os que existem + "Mais").
 */
export const BOTTOM_BAR: Record<AdminProfile, readonly AdminSection[]> = {
  super_admin: ['inicio', 'logistica', 'lojas', 'disputas'],
  operations: ['inicio', 'logistica', 'lojas', 'disputas'],
  finance: ['inicio', 'estornos', 'comissoes', 'relatorios'],
  support: ['inicio', 'lojas', 'logistica', 'moderacao'],
};

export function bottomNav(profile: AdminProfile | null): NavItem[] {
  if (!profile) return [];
  return BOTTOM_BAR[profile].map((section) => NAV_ITEMS.find((item) => item.section === section)).filter((item): item is NavItem => Boolean(item && canView(profile, item.section)));
}

export function visibleNav(profile: AdminProfile | null): NavItem[] {
  return NAV_ITEMS.filter((item) => canView(profile, item.section));
}

/** Destino pós-login seguro: só caminhos internos do admin (evita open redirect). */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/admin') || value.startsWith('//') || value.includes('\\')) return null;
  if (value.startsWith('/admin/entrar') || value.startsWith('/admin/convite')) return null;
  return value;
}
