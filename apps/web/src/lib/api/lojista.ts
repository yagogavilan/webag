import { apiRequest } from './client';
import type { Page } from './admin';

/**
 * Contrato PROVISÓRIO do lojista (Onda 2A). Ainda não está no openapi.yaml: espelha o que as telas precisam e está
 * descrito em `docs/arquitetura/pendencias-contrato-web-lojista.md`. Troque pelos tipos gerados em `@webag/shared`
 * quando o backend publicar (DT-014).
 */
export type StoreStatus = 'draft' | 'in_review' | 'correction_requested' | 'approved' | 'live' | 'rejected' | 'suspended';
export type LegalType = 'cpf' | 'cnpj';

/** Um item por documento exigido, mais "dados da loja" (WB-054 C3). */
export type DocumentKind = 'id_front' | 'id_back' | 'address_proof' | 'cnpj_card' | 'owner_id_front' | 'owner_id_back';

export interface StoreAddress {
  cep: string;
  street: string;
  number: string;
  noNumber: boolean;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  /** Ponto confirmado no mapa (ADR-008). `null` até a geocodificação ou o ajuste manual. */
  lat: number | null;
  lng: number | null;
}

export interface StoreDocument {
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Correction {
  id: string;
  target: { type: 'document'; kind: DocumentKind } | { type: 'store_data' };
  message: string;
  fixed: boolean;
}

export type PayoutStatus = 'not_connected' | 'connected' | 'under_review';

export interface MerchantStore {
  id: string;
  status: StoreStatus;
  role: 'owner' | 'staff';
  permissions: string[];
  /** Maior etapa concluída (0 a 4). A tela retoma na seguinte (WB-051 C4). */
  step: number;
  legalType: LegalType | null;
  document: string | null;
  legalName: string | null;
  fiscalAccepted: boolean;
  name: string | null;
  categoryId: string | null;
  whatsapp: string | null;
  address: StoreAddress | null;
  documents: StoreDocument[];
  payout: { status: PayoutStatus; maskedAccount: string | null; simulated: boolean };
  submittedAt: string | null;
  decisionReason: string | null;
  corrections: Correction[];
  hasActiveProduct: boolean;
  hasHours: boolean;
  /** Prazo de resposta em dias úteis (parâmetro `aprovacao_loja_sla_dias_uteis`). */
  slaBusinessDays: number;
  updatedAt: string;
}

export type StoreDraftPatch = Partial<{
  step: number;
  legalType: LegalType;
  document: string;
  legalName: string;
  fiscalAccepted: boolean;
  name: string;
  categoryId: string;
  whatsapp: string;
  address: StoreAddress;
}>;

export interface CepResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  /** `false` quando a cidade não está entre as regiões ativas (WB-051 C3). */
  served: boolean;
}

export interface UploadPolicy {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  permissions: string[];
  status: 'active' | 'invited';
  inviteExpiresAt: string | null;
}

export interface InvitePreview {
  storeName: string;
  inviteeName: string | null;
  permissions: string[];
}

const NO_STORE = 'STORE_NOT_FOUND';

export const merchantApi = {
  /** `null` = ainda sem loja (404 STORE_NOT_FOUND). */
  async store(): Promise<MerchantStore | null> {
    try {
      return await apiRequest<MerchantStore>('lojista', 'me/store');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === NO_STORE) return null;
      throw error;
    }
  },
  saveDraft: (patch: StoreDraftPatch) => apiRequest<MerchantStore>('lojista', 'me/store', { method: 'PUT', body: patch }),
  cep: (cep: string) => apiRequest<CepResult>('lojista', `geo/cep/${cep}`),
  createUpload: (body: { purpose: 'store_document'; contentType: string; sizeBytes: number }) => apiRequest<UploadPolicy>('lojista', 'uploads', { method: 'POST', body }),
  completeUpload: (uploadId: string) => apiRequest<void>('lojista', `uploads/${uploadId}/complete`, { method: 'POST' }),
  attachDocument: (kind: DocumentKind, uploadId: string) => apiRequest<StoreDocument>('lojista', `me/store/documents/${kind}`, { method: 'PUT', body: { uploadId } }),
  connectPayout: (returnPath: string) => apiRequest<{ authorizationUrl: string }>('lojista', 'me/store/payout/connect', { method: 'POST', body: { returnPath } }),
  payoutCallback: (body: { state: string; code: string }) => apiRequest<MerchantStore['payout']>('lojista', 'me/store/payout/callback', { method: 'POST', body }),
  submit: () => apiRequest<MerchantStore>('lojista', 'me/store/submit', { method: 'POST' }),
  resubmit: () => apiRequest<MerchantStore>('lojista', 'me/store/resubmit', { method: 'POST' }),
  waitlist: (body: { email: string; kind: 'merchant_signup' | 'city'; city?: string; consent: true }) => apiRequest<void>('lojista', 'waitlist', { method: 'POST', body }),
  flags: () => apiRequest<{ flags: Record<string, boolean> }>('lojista', 'config/flags'),
  becomeMerchant: (acceptedDocuments: { type: string; version: number }[]) => apiRequest<void>('lojista', 'me/merchant-role', { method: 'POST', body: { acceptedDocuments } }),
  verifyEmail: (code: string) => apiRequest<void>('lojista', 'auth/email/verify', { method: 'POST', body: { code } }),
  resendEmailCode: () => apiRequest<void>('lojista', 'auth/email/resend', { method: 'POST' }),
  team: () => apiRequest<Page<TeamMember>>('lojista', 'me/store/members'),
  invite: (body: { email: string; name?: string; permissions: string[] }) => apiRequest<void>('lojista', 'me/store/members/invitations', { method: 'POST', body }),
  updateMember: (id: string, body: { permissions: string[] }) => apiRequest<void>('lojista', `me/store/members/${id}`, { method: 'PATCH', body }),
  removeMember: (id: string, password: string) => apiRequest<void>('lojista', `me/store/members/${id}`, { method: 'DELETE', body: { password } }),
  resendInvite: (id: string) => apiRequest<void>('lojista', `me/store/members/${id}/resend`, { method: 'POST' }),
  invitePreview: (token: string) => apiRequest<InvitePreview>('lojista', `store-invitations/${encodeURIComponent(token)}`),
};

export interface LegalDoc {
  type: 'customer_terms' | 'merchant_terms' | 'privacy';
  version: number;
}

/** Versão vigente de cada documento legal (aceite versionado: o cliente envia o que mostrou ao usuário). */
export async function currentLegalRefs(types: LegalDoc['type'][]): Promise<LegalDoc[]> {
  return Promise.all(types.map((type) => apiRequest<LegalDoc>('lojista', `legal/${type}`).then((doc) => ({ type: doc.type, version: doc.version }))));
}
