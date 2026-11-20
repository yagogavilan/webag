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
  /** WB-121 / DEC-073: modo manutenção (parar as vendas). Todo perfil vê o estado; só o super admin liga e desliga. */
  'maintenance:read': [SUPER, OPS, FIN, SUP],
  'maintenance:write': [SUPER],
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
  /** WB-236: tabela de taxa de entrega; só super admin e financeiro editam, os demais perfis leem. */
  'delivery-fees:read': [SUPER, OPS, FIN, SUP],
  'delivery-fees:write': [SUPER, FIN],
  /** L.3: logística da Webag. Operação e super admin despacham e registram custo; financeiro e suporte só leem. */
  'logistics:read': [SUPER, OPS, FIN, SUP],
  'logistics:write': [SUPER, OPS],
  /** WB-240: relatórios de logística (custo e margem): super admin, operação e financeiro. */
  'logistics:report': [SUPER, OPS, FIN],
  /** SEC-145: marcar o lote do motoboy como pago é do financeiro (quem lança o custo não aprova o pagamento). */
  'logistics:payout': [SUPER, FIN],
  /** SEC-144: "Revelar" telefone e endereço do cliente da corrida, com motivo e auditoria; o detalhe comum não traz o contato. */
  'logistics:contact': [SUPER, OPS, FIN, SUP],
  /** WB-248: relatório de trocas por loja e categoria; custos só para super admin e financeiro (checado no controller). */
  'exchanges:report': [SUPER, OPS, FIN],
  /** WB-110: fila de mediação e decisão sobre trocas contestadas ou com inspeção reprovada; operação e super admin. */
  'exchanges:mediate': [SUPER, OPS],
  /** AT3/M3: lista e detalhe das trocas (suporte atende o cliente); isentar a taxa é de operação e super admin. */
  'exchanges:read': [SUPER, OPS, FIN, SUP],
  'exchanges:waive-fee': [SUPER, OPS],
  /** WB-217: pedidos de titulares (LGPD) são só do super admin; revelar o e-mail do solicitante exige reautenticação e auditoria. */
  'privacy:manage': [SUPER],
  /** AJ3 / WB-034: conteúdo da ajuda (perguntas e contatos); operação e super admin editam, os demais leem. */
  'help:read': [SUPER, OPS, FIN, SUP],
  'help:write': [SUPER, OPS],
  /** WB-197: campanhas de push de marketing (financeiro e suporte não veem). */
  'marketing:push': [SUPER, OPS],
  /** W.7 (WB-125): contagens de pendências do Início do admin; todo perfil lê, mas cada área só vem para quem tem a permissão dela (o resto vai nulo). */
  'overview:read': [SUPER, OPS, FIN, SUP],
  /** WB-122: relatórios operacionais (suporte não vê). */
  'reports:operations': [SUPER, OPS, FIN],
  /** WB-114 (DT-060): os 2 CSV financeiros do piloto (Receita por pedido e Estornos): comissão, taxa do provedor e líquido da loja; só financeiro e super admin. */
  'reports:finance': [SUPER, FIN],
  /** WB-116: cupons da plataforma. Financeiro lê (relatório de uso e custo); só operação e super admin criam e pausam. */
  'coupons:read': [SUPER, OPS, FIN],
  'coupons:write': [SUPER, OPS],
  /**
   * B3 / WB-198 / WB-113 (leitura): caixa de alertas de operação. Todo perfil lê, mas só os TIPOS do seu público (`alert-catalog.ts`: dinheiro é do financeiro e do
   * super admin; logística e pedidos, da operação e do suporte; LGPD, só do super admin). Encerrar à mão (com nota) é de quem age: super admin, operação e financeiro.
   */
  'alerts:read': [SUPER, OPS, FIN, SUP],
  'alerts:resolve': [SUPER, OPS, FIN],
  /** B4 / WB-102: buscar e ver clientes e lojistas (dados mascarados): super admin, operação e suporte. Bloquear e desbloquear: super admin e operação (a loja do lojista é suspensa junto, WB-102 C5). */
  'users:read': [SUPER, OPS, SUP],
  'users:block': [SUPER, OPS],
  /** B5 / WB-108: lista e detalhe de pedidos (dados do cliente mascarados). Cancelar e estornar seguem em `orders:refund`. */
  'orders:read': [SUPER, OPS, FIN, SUP],
  'payments:alerts:read': [SUPER, FIN],
  'payments:webhooks:reprocess': [SUPER, FIN],
  /** SEC-130: fila de estornos recusados pelo provedor; tentar de novo é do financeiro, cobrir com dinheiro da Webag é só do super admin. */
  /** SEC-039: estorno manual de pedido (acima de `estorno_super_admin_cents`, só o super admin). */
  'orders:refund': [SUPER, FIN],
  'payments:refunds:read': [SUPER, FIN],
  'payments:refunds:retry': [SUPER, FIN],
  'payments:refunds:cover': [SUPER],
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
