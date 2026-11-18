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
  'parameters:read': [SUPER, OPS, FIN],
  'parameters:write': [SUPER],
  'flags:read': [SUPER, OPS, FIN, SUP],
  'flags:write': [SUPER],
  'legal:read': [SUPER, OPS, FIN, SUP],
  'legal:write': [SUPER],
  'audit:read': [SUPER],
  'admins:manage': [SUPER],
  'payments:alerts:read': [SUPER, FIN],
  'payments:webhooks:reprocess': [SUPER, FIN],
} as const satisfies Record<string, readonly AdminProfile[]>;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

export function adminHasPermission(profile: AdminProfile, permission: AdminPermission): boolean {
  return (ADMIN_PERMISSIONS[permission] as readonly AdminProfile[]).includes(profile);
}

/** Permissões que o dono da loja pode marcar para funcionários (RN-13). */
export const STAFF_ASSIGNABLE_PERMISSIONS = ['orders', 'catalog', 'exchanges', 'coupons', 'reviews'] as const;
/** Só o dono: financeiro, conta de recebimento, equipe e configurações (RN-13). */
export const OWNER_ONLY_PERMISSIONS = ['finance', 'payment_account', 'team', 'settings'] as const;

export type StorePermissionName =
  | (typeof STAFF_ASSIGNABLE_PERMISSIONS)[number]
  | (typeof OWNER_ONLY_PERMISSIONS)[number];

export function memberHasStorePermission(
  member: { role: 'owner' | 'staff'; permissions: readonly string[] },
  permission: StorePermissionName,
): boolean {
  if (member.role === 'owner') return true;
  if ((OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission)) return false;
  return member.permissions.includes(permission);
}
