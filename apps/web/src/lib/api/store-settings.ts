import { apiRequest } from './client';

/**
 * Configuração da loja (C1 a C5, WB-055 a 059). Espelha `StoreSettingsService.present()` e os controllers de
 * `apps/api/src/modules/stores`. Os endpoints existem no openapi.yaml; este módulo usa o BFF como o resto de `apps/web`.
 */
export interface DayHours {
  /** 0 = domingo a 6 = sábado (igual à API). */
  weekday: number;
  intervals: { start: string; end: string }[];
}
export interface Holiday {
  date: string;
  label: string | null;
}
export interface Tier {
  fromKm: number;
  toKm: number;
  feeCents: number;
}
export interface DeliverySettings {
  acceptsDelivery: boolean;
  radiusKm: number;
  feeMode: 'fixed' | 'by_distance';
  feeFixedCents: number;
  tiers: Tier[];
  minOrderCents: number;
  freeAboveCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
}
export interface PickupSettings {
  enabled: boolean;
  useStoreAddress: boolean;
  address: string | null;
  instructions: string | null;
  prepMinMinutes: number;
  prepMaxMinutes: number;
}
export interface ExchangeSettings {
  voluntaryDays: number;
  collectionFeeCents: number;
  version: number;
  legalFloor: { withdrawalDays: number; defectDays: number };
}
export interface PauseState {
  active: boolean;
  until: string | null;
  indefinitely: boolean;
}
export interface StoreSettings {
  isOpenNow: boolean;
  hours: DayHours[];
  holidays: Holiday[];
  pause: PauseState;
  delivery: DeliverySettings;
  pickup: PickupSettings;
  exchangePolicy: ExchangeSettings;
  lowStockThreshold: number;
}

export type PauseKind = '30m' | '1h' | '2h' | 'end_of_day' | 'until_resume';

export interface DeliveryPreview {
  available: boolean;
  distanceM: number | null;
  feeCents: number | null;
  freeShipping: boolean;
  belowMinimum: boolean;
}

export interface ProfileView {
  id: string;
  name: string | null;
  description: string | null;
  whatsapp: string | null;
  mainCategoryId: string | null;
  extraCategoryIds: string[];
  logo: Record<string, string> | null;
  cover: Record<string, string> | null;
  pendingReview: boolean;
  document: string;
  documentType: 'cpf' | 'cnpj';
}

export interface ProfilePatch {
  name?: string;
  description?: string;
  mainCategoryId?: string;
  extraCategoryIds?: string[];
  whatsapp?: string;
  logoAssetId?: string | null;
  coverAssetId?: string | null;
}

const L = 'lojista' as const;

export const settingsApi = {
  get: (storeId: string) => apiRequest<StoreSettings>(L, `stores/${storeId}/settings`),
  profile: (storeId: string) => apiRequest<ProfileView>(L, `stores/${storeId}`),
  saveProfile: (storeId: string, body: ProfilePatch) => apiRequest<ProfileView>(L, `stores/${storeId}/profile`, { method: 'PATCH', body }),
  setHours: (storeId: string, days: DayHours[]) => apiRequest<void>(L, `stores/${storeId}/hours`, { method: 'PUT', body: { days } }),
  setHolidays: (storeId: string, holidays: { date: string; label?: string }[]) => apiRequest<void>(L, `stores/${storeId}/holidays`, { method: 'PUT', body: { holidays } }),
  pause: (storeId: string, kind: PauseKind) => apiRequest<void>(L, `stores/${storeId}/pause`, { method: 'POST', body: { kind } }),
  resume: (storeId: string) => apiRequest<void>(L, `stores/${storeId}/pause`, { method: 'DELETE' }),
  setDelivery: (storeId: string, body: DeliverySettings) => apiRequest<void>(L, `stores/${storeId}/delivery`, { method: 'PUT', body }),
  preview: (storeId: string, body: { cep: string; subtotalCents: number }) => apiRequest<DeliveryPreview>(L, `stores/${storeId}/delivery/preview`, { method: 'POST', body }),
  setPickup: (storeId: string, body: { enabled: boolean; useStoreAddress: boolean; address?: string; instructions?: string; prepMinMinutes: number; prepMaxMinutes: number }) => apiRequest<void>(L, `stores/${storeId}/pickup`, { method: 'PUT', body }),
  setExchange: (storeId: string, body: { voluntaryDays: number; collectionFeeCents: number; confirmDefault?: boolean }) => apiRequest<void>(L, `stores/${storeId}/exchange-policy`, { method: 'PUT', body }),
};

export const settingsKeys = {
  settings: (storeId: string) => ['lojista', 'settings', storeId] as const,
  profile: (storeId: string) => ['lojista', 'profile', storeId] as const,
};
