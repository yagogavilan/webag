import type { AdminProfile } from '../../modules/identity/db/schema.js';

const SUPER = 'super_admin';
const OPS = 'operations';
const FIN = 'finance';
const SUP = 'support';

/**
 * UMA tabela de permissões (SEC-021): o guard e o teste de matriz leem daqui. RN-13:
 * - operação: lojas, catálogo, regiões, conteúdo; sem financeiro nem admins;
 * - financeiro: comissões, repasses, estornos, conciliação; leitura de pedidos;
 * - suporte: leitura de clientes, lojas e pedidos; sem edição de loja.
 * Parâmetros, flags, termos, admins e auditoria são do super admin (WB-117, 119, 120, 101, 123).
 */
export const ADMIN_PERMISSIONS = {
  'regions:read': [SUPER, OPS, FIN, SUP],
  'regions:write': [SUPER, OPS],
  'categories:read': [SUPER, OPS, FIN, SUP],
  'categories:write': [SUPER, OPS],
  'banners:read': [SUPER, OPS, FIN, SUP],
  'banners:write': [SUPER, OPS],
  'parameters:read': [SUPER, OPS, FIN],
  'parameters:write': [SUPER],
  'flags:read': [SUPER, OPS, FIN, SUP],
  'flags:write': [SUPER],
  'legal:read': [SUPER, OPS, FIN, SUP],
  'legal:write': [SUPER],
  /** Auditoria: super admin vê tudo; os demais perfis só as próprias ações (o filtro é forçado no controller). */
  'audit:own': [SUPER, OPS, FIN, SUP],
  'admins:manage': [SUPER],
  // Lojas (RN-13, WB-103/104/218): operação e super decidem e veem documentos; financeiro e suporte só leem.
  'stores:read': [SUPER, OPS, FIN, SUP],
  'stores:write': [SUPER, OPS],
  'stores:decide': [SUPER, OPS],
  'stores:documents': [SUPER, OPS],
  'products:read': [SUPER, OPS, FIN, SUP],
  'products:moderate': [SUPER, OPS],
  'moderation:read': [SUPER, OPS],
  'moderation:write': [SUPER, OPS],
  /** WB-105/111: comissão por loja e categoria; financeiro e super admin. */
  'commissions:read': [SUPER, FIN],
  'commissions:write': [SUPER, FIN],
  'payments:alerts:read': [SUPER, FIN],
  'payments:webhooks:reprocess': [SUPER, FIN],
} as const satisfies Record<string, readonly AdminProfile[]>;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

export function adminHasPermission(profile: AdminProfile, permission: AdminPermission): boolean {
  return (ADMIN_PERMISSIONS[permission] as readonly AdminProfile[]).includes(profile);
}

/** Permissões que o dono da loja pode marcar para funcionários (RN-13). */
export const STAFF_ASSIGNABLE_PERMISSIONS = ['orders', 'catalog', 'exchanges', 'coupons', 'reviews', 'sales_values'] as const;
/** Só o dono: financeiro, conta de recebimento, equipe e configurações (RN-13). */
export const OWNER_ONLY_PERMISSIONS = ['finance', 'payment_account', 'team', 'settings'] as const;

/** `member`: qualquer membro da loja (dono ou funcionário), para telas sem dado sensível. */
export type StorePermissionName =
  | 'member'
  | (typeof STAFF_ASSIGNABLE_PERMISSIONS)[number]
  | (typeof OWNER_ONLY_PERMISSIONS)[number];

export function memberHasStorePermission(
  member: { role: 'owner' | 'staff'; permissions: readonly string[] },
  permission: StorePermissionName,
): boolean {
  if (member.role === 'owner' || permission === 'member') return true;
  if ((OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission)) return false;
  return member.permissions.includes(permission);
}
