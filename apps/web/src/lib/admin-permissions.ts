import type { AdminSection } from './admin-access';
import type { AdminProfile } from './session-types';

/**
 * Espelho da matriz `ADMIN_PERMISSIONS` da API (`apps/api/src/platform/auth/permissions.ts`; as chaves são as de `x-admin-permission` do
 * `openapi.yaml`). WB-355: o painel só DESENHA conforme esta matriz; quem barra é a API (403). O teste `admin-permissions.spec.ts` lê o
 * arquivo da API e falha se as duas tabelas divergirem, então uma permissão nova ou alterada na API não passa despercebida aqui.
 */
const SUPER = 'super_admin';
const OPS = 'operations';
const FIN = 'finance';
const SUP = 'support';
type Profiles = readonly AdminProfile[];
const ALL: Profiles = [SUPER, OPS, FIN, SUP];

export const ADMIN_PERMISSIONS = {
  'regions:read': ALL,
  'regions:write': [SUPER, OPS],
  'categories:read': ALL,
  'categories:write': [SUPER, OPS],
  'banners:read': ALL,
  'banners:write': [SUPER, OPS],
  'parameters:read': [SUPER, OPS, FIN],
  'parameters:write': [SUPER],
  'flags:read': ALL,
  'flags:write': [SUPER],
  'maintenance:read': ALL,
  'maintenance:write': [SUPER],
  'legal:read': ALL,
  'legal:write': [SUPER],
  'audit:own': ALL,
  'admins:manage': [SUPER],
  'stores:read': ALL,
  'stores:write': [SUPER, OPS],
  'stores:decide': [SUPER, OPS],
  'stores:documents': [SUPER, OPS],
  'products:read': ALL,
  'products:moderate': [SUPER, OPS],
  'moderation:read': [SUPER, OPS],
  'moderation:write': [SUPER, OPS],
  'commissions:read': [SUPER, FIN],
  'commissions:write': [SUPER, FIN],
  'delivery-fees:read': ALL,
  'delivery-fees:write': [SUPER, FIN],
  'logistics:read': ALL,
  'logistics:write': [SUPER, OPS],
  'logistics:report': [SUPER, OPS, FIN],
  'logistics:payout': [SUPER, FIN],
  'logistics:contact': ALL,
  'exchanges:report': [SUPER, OPS, FIN],
  'exchanges:mediate': [SUPER, OPS],
  'exchanges:read': ALL,
  'exchanges:waive-fee': [SUPER, OPS],
  'privacy:manage': [SUPER],
  'help:read': ALL,
  'help:write': [SUPER, OPS],
  'marketing:push': [SUPER, OPS],
  'overview:read': ALL,
  'reports:operations': [SUPER, OPS, FIN],
  'reports:finance': [SUPER, FIN],
  'coupons:read': [SUPER, OPS, FIN],
  'coupons:write': [SUPER, OPS],
  'alerts:read': ALL,
  'alerts:resolve': [SUPER, OPS, FIN],
  'users:read': [SUPER, OPS, SUP],
  'users:block': [SUPER, OPS],
  'orders:read': ALL,
  'payments:alerts:read': [SUPER, FIN],
  'payments:webhooks:reprocess': [SUPER, FIN],
  'orders:refund': [SUPER, FIN],
  'payments:refunds:read': [SUPER, FIN],
  'payments:refunds:retry': [SUPER, FIN],
  'payments:refunds:cover': [SUPER],
  'store-catalog:write': [SUPER, OPS],
  'store-history:export': [SUPER, OPS, FIN],
  'view-as:open': ALL,
  'analytics:read': [SUPER, OPS, FIN],
} as const satisfies Record<string, Profiles>;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

/** Perfil novo, ausente ou permissão desconhecida: nega (WB-355 C3). */
export function can(profile: AdminProfile | null | undefined, permission: AdminPermission): boolean {
  if (!profile) return false;
  const allowed = ADMIN_PERMISSIONS[permission] as Profiles | undefined;
  return allowed !== undefined && allowed.includes(profile);
}

/**
 * Permissão de LEITURA e de ESCRITA que a API exige para a tela principal de cada seção do menu. O menu (`admin-access.ts`) pode esconder
 * MAIS do que a API permite (decisão de design), nunca menos: o teste confere que `canView`/`canEdit` ⊆ a permissão daqui.
 */
export const SECTION_PERMISSIONS: Record<AdminSection, { read: AdminPermission; write: AdminPermission | null }> = {
  inicio: { read: 'overview:read', write: null },
  lojas: { read: 'stores:read', write: 'stores:write' },
  logistica: { read: 'logistics:read', write: 'logistics:write' },
  estornos: { read: 'payments:refunds:read', write: 'payments:refunds:retry' },
  frete: { read: 'delivery-fees:read', write: 'delivery-fees:write' },
  comissoes: { read: 'commissions:read', write: 'commissions:write' },
  trocas: { read: 'exchanges:report', write: null },
  // A fila de moderação lê `admin/products` (products:read) e decide por `products:moderate`; as regras de termos são `moderation:*`.
  moderacao: { read: 'products:read', write: 'products:moderate' },
  regioes: { read: 'regions:read', write: 'regions:write' },
  categorias: { read: 'categories:read', write: 'categories:write' },
  parametros: { read: 'parameters:read', write: 'parameters:write' },
  parametros_entrega: { read: 'parameters:read', write: 'parameters:write' },
  flags: { read: 'flags:read', write: 'flags:write' },
  termos: { read: 'legal:read', write: 'legal:write' },
  auditoria: { read: 'audit:own', write: null },
  admins: { read: 'admins:manage', write: 'admins:manage' },
  banners: { read: 'banners:read', write: 'banners:write' },
  push: { read: 'marketing:push', write: 'marketing:push' },
  cupons: { read: 'coupons:read', write: 'coupons:write' },
  relatorios: { read: 'reports:operations', write: null },
  denuncias: { read: 'moderation:read', write: 'moderation:write' },
  ajuda: { read: 'help:read', write: 'help:write' },
  titulares: { read: 'privacy:manage', write: 'privacy:manage' },
  disputas: { read: 'exchanges:mediate', write: 'exchanges:mediate' },
  alertas: { read: 'alerts:read', write: 'alerts:resolve' },
  pedidos: { read: 'orders:read', write: 'orders:refund' },
  usuarios: { read: 'users:read', write: 'users:block' },
  manutencao: { read: 'maintenance:read', write: 'maintenance:write' },
};
