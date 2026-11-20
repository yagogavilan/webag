import type {
  AdminAlert,
  AdminAlertArea,
  AdminAlertKind,
  AdminAlertPage,
  AdminAlertSeverity,
  AdminAlertsSummary,
  AdminOrderDetail,
  AdminOrderPage,
  AdminUserBlockResult,
  AdminUserDetail,
  AdminUserPage,
  MaintenanceAdminStatus,
  MaintenanceStatus,
  OrderStatus,
} from '@webag/shared';
import { apiRequest } from './client';

/**
 * Alertas (B3), usuários (B4), pedidos (B5) e modo manutenção (WB-121) do admin. Tipos do OpenAPI via `@webag/shared`.
 * Permissões: `alerts:read|resolve`, `users:read|block`, `orders:read` (+ `orders:refund` para cancelar e estornar), `maintenance:read|write`.
 */
export type { AdminAlert, AdminAlertArea, AdminAlertKind, AdminAlertPage, AdminAlertSeverity, AdminAlertsSummary, AdminOrderDetail, AdminOrderPage, AdminUserBlockResult, AdminUserDetail, AdminUserPage, MaintenanceAdminStatus, MaintenanceStatus };

const A = 'admin' as const;

export type AlertStatusFilter = 'open' | 'resolved' | 'all';
export interface AlertFilters {
  status: AlertStatusFilter;
  severity?: AdminAlertSeverity | undefined;
  kind?: string | undefined;
}
export interface UserFilters {
  q?: string | undefined;
  role?: 'customer' | 'merchant' | undefined;
  status?: 'active' | 'blocked' | 'deleted' | undefined;
}
export interface OrderFilters {
  q?: string | undefined;
  /** Lista separada por vírgula (`received,accepted`). */
  status?: string | undefined;
  mode?: 'delivery' | 'pickup' | undefined;
  paymentMethod?: 'pix' | 'card' | undefined;
  city?: string | undefined;
  storeId?: string | undefined;
  userId?: string | undefined;
  /** Datas `AAAA-MM-DD` do campo; o BFF recebe o instante ISO do início e do fim do dia em Brasília. */
  from?: string | undefined;
  to?: string | undefined;
}

/** Início e fim do dia (Brasília) em ISO; vazio ou inválido vira indefinido. */
export function dayStartIso(ymd: string | undefined): string | undefined {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const date = new Date(`${ymd}T00:00:00-03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
export function dayEndIso(ymd: string | undefined): string | undefined {
  const start = dayStartIso(ymd);
  return start ? new Date(new Date(start).getTime() + 86_400_000 - 1).toISOString() : undefined;
}

export const adminOpsApi = {
  alerts: (filters: AlertFilters, cursor?: string) => apiRequest<AdminAlertPage>(A, 'admin/alerts', { query: { status: filters.status, severity: filters.severity, kind: filters.kind, cursor, limit: 20 } }),
  alertsSummary: () => apiRequest<AdminAlertsSummary>(A, 'admin/alerts/summary'),
  alertKinds: () => apiRequest<{ data: AdminAlertKind[]; nextCursor: null }>(A, 'admin/alerts/kinds'),
  alert: (id: string) => apiRequest<AdminAlert>(A, `admin/alerts/${id}`),
  resolveAlert: (id: string, note: string) => apiRequest<AdminAlert>(A, `admin/alerts/${id}/resolve`, { method: 'POST', body: { note } }),

  users: (filters: UserFilters, cursor?: string) => apiRequest<AdminUserPage>(A, 'admin/users', { query: { q: filters.q, role: filters.role, status: filters.status, cursor, limit: 20 } }),
  user: (id: string) => apiRequest<AdminUserDetail>(A, `admin/users/${id}`),
  blockUser: (id: string, reason: string) => apiRequest<AdminUserBlockResult>(A, `admin/users/${id}/block`, { method: 'POST', body: { reason } }),
  unblockUser: (id: string, reason: string) => apiRequest<AdminUserDetail>(A, `admin/users/${id}/unblock`, { method: 'POST', body: { reason } }),

  orders: (filters: OrderFilters, cursor?: string) =>
    apiRequest<AdminOrderPage>(A, 'admin/orders', { query: { q: filters.q, status: filters.status, mode: filters.mode, paymentMethod: filters.paymentMethod, city: filters.city, storeId: filters.storeId, userId: filters.userId, from: dayStartIso(filters.from), to: dayEndIso(filters.to), cursor, limit: 50 } }),
  order: (id: string) => apiRequest<AdminOrderDetail>(A, `admin/orders/${id}`),
  cancelOrder: (id: string, body: { reason: string; refund: boolean }) => apiRequest<{ status: 'cancelled'; refunded: { amount: number }; remaining: { amount: number } }>(A, `admin/orders/${id}/cancel`, { method: 'POST', body }),
  refundOrder: (id: string, body: { amountCents: number; reason: string }, idempotencyKey: string) => apiRequest<{ status: 'done' | 'queued'; refunded: { amount: number }; remaining: { amount: number } }>(A, `admin/orders/${id}/refunds`, { method: 'POST', body, idempotencyKey }),

  maintenance: () => apiRequest<MaintenanceAdminStatus>(A, 'admin/maintenance'),
  setMaintenance: (body: { enabled: boolean; reason: string; message?: string; expectedBackAt?: string | null }) => apiRequest<MaintenanceAdminStatus>(A, 'admin/maintenance', { method: 'PUT', body }),
};

export const adminOpsKeys = {
  alerts: ['admin', 'alerts'] as const,
  alertList: (filters: AlertFilters) => ['admin', 'alerts', 'list', filters.status, filters.severity ?? '', filters.kind ?? ''] as const,
  alertSummary: ['admin', 'alerts', 'summary'] as const,
  alertKinds: ['admin', 'alerts', 'kinds'] as const,
  alert: (id: string) => ['admin', 'alerts', 'detail', id] as const,
  users: ['admin', 'users'] as const,
  userList: (filters: UserFilters) => ['admin', 'users', 'list', filters.q ?? '', filters.role ?? '', filters.status ?? ''] as const,
  user: (id: string) => ['admin', 'users', 'detail', id] as const,
  orders: ['admin', 'orders'] as const,
  orderList: (filters: OrderFilters) => ['admin', 'orders', 'list', filters] as const,
  order: (id: string) => ['admin', 'orders', 'detail', id] as const,
  maintenance: ['admin', 'maintenance'] as const,
};

export const ALERT_AREA_LABEL: Record<AdminAlertArea, string> = {
  payments: 'Pagamentos',
  orders: 'Pedidos',
  logistics: 'Logística',
  exchanges: 'Trocas',
  stores: 'Lojas',
  privacy: 'Privacidade (LGPD)',
  platform: 'Plataforma',
};
export const ALERT_SEVERITY_LABEL: Record<AdminAlertSeverity, string> = { critical: 'Crítico', warning: 'Atenção', info: 'Acompanhar' };

export const MODE_LABEL = { delivery: 'Entrega', pickup: 'Retirada' } as const;
export const PAYMENT_LABEL = { pix: 'PIX', card: 'Cartão' } as const;

/** Rótulos do pedido para o admin: o estado como o cliente e a loja entendem, sem "Aguardando você" (que é do lojista). */
export const ADMIN_ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguardando pagamento',
  received: 'Aguardando a loja aceitar',
  accepted: 'Aceito pela loja',
  in_preparation: 'Em separação',
  ready_for_collection: 'Pronto para coleta',
  out_for_delivery: 'Com o entregador',
  ready_for_pickup: 'Pronto para retirar',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refused: 'Recusado pela loja',
  expired: 'Pagamento vencido',
};
export const ORDER_STATUS_FILTERS: { id: string; label: string; status?: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Em andamento', status: 'received,accepted,in_preparation,ready_for_collection,out_for_delivery,ready_for_pickup' },
  { id: 'awaiting_payment', label: 'Aguardando pagamento', status: 'awaiting_payment' },
  { id: 'delivered', label: 'Entregues', status: 'delivered' },
  { id: 'cancelled', label: 'Cancelados', status: 'cancelled,refused,expired' },
];
export const ORDER_TERMINAL: readonly OrderStatus[] = ['delivered', 'cancelled', 'refused', 'expired'];
export const ACTOR_LABEL = { customer: 'Cliente', store: 'Loja', system: 'Sistema', admin: 'Webag' } as const;
