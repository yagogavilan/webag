import type { AdminProfile } from '@/lib/session-types';

export const PROFILES: AdminProfile[] = ['super_admin', 'operations', 'finance', 'support'];

export type Access = 'can' | 'view' | 'no';

/** Matriz do PRD (`docs/produto/prd/admin.md`, RN-13) em texto para o super admin decidir sem abrir o documento. */
export const MATRIX: { action: string; access: Record<AdminProfile, Access> }[] = [
  { action: 'Gerenciar admins, parâmetros, flags e manutenção', access: { super_admin: 'can', operations: 'no', finance: 'no', support: 'no' } },
  { action: 'Aprovar, suspender e editar loja; moderar', access: { super_admin: 'can', operations: 'can', finance: 'no', support: 'no' } },
  { action: 'Comissões, taxa de serviço, repasses e conciliação', access: { super_admin: 'can', operations: 'no', finance: 'can', support: 'no' } },
  { action: 'Estornar até R$ 500', access: { super_admin: 'can', operations: 'no', finance: 'can', support: 'no' } },
  { action: 'Estornar acima de R$ 500', access: { super_admin: 'can', operations: 'no', finance: 'no', support: 'no' } },
  { action: 'Cancelar pedido', access: { super_admin: 'can', operations: 'can', finance: 'can', support: 'no' } },
  { action: 'Mediar troca ou disputa', access: { super_admin: 'can', operations: 'can', finance: 'no', support: 'no' } },
  { action: 'Banners, cupons da plataforma, push e termos', access: { super_admin: 'can', operations: 'can', finance: 'no', support: 'no' } },
  { action: 'Regiões e categorias', access: { super_admin: 'can', operations: 'can', finance: 'no', support: 'no' } },
  { action: 'Ver clientes, lojas e pedidos', access: { super_admin: 'can', operations: 'can', finance: 'view', support: 'view' } },
  { action: 'Redefinir senha de cliente e bloquear', access: { super_admin: 'can', operations: 'can', finance: 'no', support: 'view' } },
  { action: 'Ver documentos de loja', access: { super_admin: 'can', operations: 'can', finance: 'no', support: 'no' } },
  { action: 'Ver auditoria', access: { super_admin: 'can', operations: 'view', finance: 'view', support: 'view' } },
];

export const ACCESS_TEXT: Record<Access, string> = { can: 'Pode', view: 'Só vê', no: 'Não' };

/** Último super admin ativo: não pode ser desativado nem rebaixado (WB-101 C3). */
export function isLastSuper(admins: { userId: string; profile: AdminProfile; active: boolean }[], userId: string): boolean {
  const supers = admins.filter((a) => a.profile === 'super_admin' && a.active);
  return supers.length === 1 && supers[0]?.userId === userId;
}
