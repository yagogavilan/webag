import type { GetAdminPendingCounts200 } from '@webag/shared';
import { apiRequest } from './client';
import type { AdminProfile } from '../session-types';

/**
 * Contrato PROVISÓRIO dos endpoints do admin (DT-014): espelha os controllers de `apps/api/src/modules/admin` e
 * `identity`. Troque pelos tipos gerados em `@webag/shared` quando o backend publicar o OpenAPI.
 */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface Neighborhood {
  id: string;
  cityId: string;
  name: string;
  active: boolean;
}
export interface City {
  id: string;
  name: string;
  state: string;
  slug: string;
  active: boolean;
  neighborhoods: Neighborhood[];
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  parentId: string | null;
  position: number;
  active: boolean;
}
export type CategoryNode = Category & { children: Category[] };
export interface CategoryList extends Page<CategoryNode> {
  icons: string[];
}

export type ParameterType = 'int' | 'decimal' | 'enum' | 'window';
export interface Parameter {
  key: string;
  value: string | number;
  default: string | number;
  type: ParameterType;
  min: number | null;
  max: number | null;
  values: string[] | null;
  description: string;
  ref: string;
  legalFloor: boolean;
  updatedAt: string | null;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string | null;
}

export type LegalType = 'customer_terms' | 'merchant_terms' | 'privacy';
export interface LegalDocument {
  id: string;
  type: LegalType;
  version: number;
  title: string;
  content: string;
  effectiveAt: string;
  relevantChange: boolean;
  createdAt: string;
}

export interface AuditRow {
  id: number;
  at: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  requestId: string | null;
  reason: string | null;
}
export interface AuditFilters {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}

export interface AdminUser {
  userId: string;
  name: string;
  email: string;
  profile: AdminProfile;
  active: boolean;
  totpConfigured: boolean;
}

export type VerifiedChannel = 'video_call' | 'in_person' | 'registered_phone';

export interface SessionRow {
  id: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ip: string | null;
}

const A = 'admin' as const;

/** W.7: contagens por área para o Início e para os contadores da barra. Área sem permissão vem `null`. */
export type PendingCounts = GetAdminPendingCounts200;

export const adminApi = {
  pending: () => apiRequest<PendingCounts>(A, 'admin/overview/pending'),
  cities: () => apiRequest<Page<City>>(A, 'admin/regions/cities'),
  createCity: (body: { name: string; state: string; active: boolean }) => apiRequest<City>(A, 'admin/regions/cities', { method: 'POST', body }),
  updateCity: (id: string, body: { name?: string; active?: boolean }) => apiRequest<City>(A, `admin/regions/cities/${id}`, { method: 'PATCH', body }),
  createNeighborhood: (cityId: string, body: { name: string; active: boolean }) => apiRequest<Neighborhood>(A, `admin/regions/cities/${cityId}/neighborhoods`, { method: 'POST', body }),
  updateNeighborhood: (id: string, body: { name?: string; active?: boolean }) => apiRequest<Neighborhood>(A, `admin/regions/neighborhoods/${id}`, { method: 'PATCH', body }),

  categories: () => apiRequest<CategoryList>(A, 'admin/categories'),
  createCategory: (body: { name: string; icon: string; parentId: string | null; active: boolean; position?: number }) => apiRequest<Category>(A, 'admin/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: { name?: string; icon?: string; active?: boolean }) => apiRequest<Category>(A, `admin/categories/${id}`, { method: 'PATCH', body }),
  reorderCategories: (ids: string[]) => apiRequest<void>(A, 'admin/categories/order', { method: 'PUT', body: { ids } }),
  deleteCategory: (id: string) => apiRequest<void>(A, `admin/categories/${id}`, { method: 'DELETE' }),

  parameters: () => apiRequest<Page<Parameter>>(A, 'admin/parameters'),
  updateParameter: (key: string, value: string | number, reason: string) => apiRequest<Parameter>(A, `admin/parameters/${key}`, { method: 'PUT', body: { value, reason } }),
  resetParameter: (key: string, reason: string) => apiRequest<Parameter>(A, `admin/parameters/${key}/reset`, { method: 'POST', body: { reason } }),

  flags: () => apiRequest<Page<FeatureFlag>>(A, 'admin/feature-flags'),
  setFlag: (key: string, enabled: boolean) => apiRequest<FeatureFlag>(A, `admin/feature-flags/${key}`, { method: 'PUT', body: { enabled } }),

  legalVersions: (type: LegalType) => apiRequest<Page<LegalDocument>>(A, `admin/legal/${type}`),
  publishLegal: (type: LegalType, body: { title: string; content: string; effectiveAt: string; relevantChange: boolean }) => apiRequest<LegalDocument>(A, `admin/legal/${type}`, { method: 'POST', body }),

  audit: (filters: AuditFilters, cursor?: string) => apiRequest<Page<AuditRow>>(A, 'admin/audit-log', { query: { ...filters, cursor, limit: 50 } }),

  admins: () => apiRequest<Page<AdminUser>>(A, 'admin/admins'),
  inviteAdmin: (body: { name: string; email: string; profile: AdminProfile }) => apiRequest<{ invitationId: string; expiresAt: string }>(A, 'admin/admins', { method: 'POST', body }),
  updateAdmin: (userId: string, body: { profile?: AdminProfile; active?: boolean }) => apiRequest<void>(A, `admin/admins/${userId}`, { method: 'PATCH', body }),
  revokeInvitation: (invitationId: string) => apiRequest<void>(A, `admin/admins/invitations/${invitationId}`, { method: 'DELETE' }),
  resetTotp: (userId: string, body: { reason: string; verifiedChannel: VerifiedChannel }) => apiRequest<void>(A, `admin/admins/${userId}/totp/reset`, { method: 'POST', body }),

  /** PENDENTE no backend (DT-018): o service existe (`regenerateRecoveryCodes`), a rota ainda não. Caminho assumido. */
  regenerateRecoveryCodes: () => apiRequest<{ recoveryCodes: string[] }>(A, 'admin/totp/recovery-codes', { method: 'POST' }),
  sessions: () => apiRequest<Page<SessionRow>>(A, 'me/sessions'),

  changePassword: (body: { currentPassword: string; newPassword: string }) => apiRequest<{ ok: true }>(A, 'me/password', { method: 'POST', body }),
  logoutAll: () => apiRequest<void>(A, 'auth/logout-all', { method: 'POST' }),
};

export const keys = {
  cities: ['admin', 'cities'] as const,
  categories: ['admin', 'categories'] as const,
  parameters: ['admin', 'parameters'] as const,
  flags: ['admin', 'flags'] as const,
  legal: (type: LegalType) => ['admin', 'legal', type] as const,
  audit: (filters: AuditFilters) => ['admin', 'audit', filters] as const,
  admins: ['admin', 'admins'] as const,
  sessions: ['admin', 'sessions'] as const,
};
