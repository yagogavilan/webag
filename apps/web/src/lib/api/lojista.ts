import { apiRequest } from './client';

/**
 * Lojista (Onda 2A). Os endpoints de `stores`, `uploads` e `cep` já existem em `apps/api` mas ainda não estão no
 * openapi.yaml (DT-014): este módulo espelha os controllers e monta o `MerchantStore`, o modelo que as telas usam.
 * Lacunas de contrato: `docs/arquitetura/pendencias-contrato-web-lojista.md`. Trocar pelos tipos gerados em
 * `@webag/shared` quando o backend publicar.
 */
export type StoreStatus = 'draft' | 'in_review' | 'correction_requested' | 'approved' | 'live' | 'rejected' | 'suspended';
export type LegalType = 'cpf' | 'cnpj';

/** Um item por documento exigido, mais "dados da loja" (WB-054 C3). CNPJ: cartão e um documento do responsável (API). */
export type DocumentKind = 'id_front' | 'id_back' | 'address_proof' | 'cnpj_card' | 'responsible_id';

export interface StoreAddress {
  cep: string;
  street: string;
  number: string;
  noNumber: boolean;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  /** Ponto da loja (ADR-008). `null` até a geocodificação; a API exige o ponto para enviar à análise. */
  lat: number | null;
  lng: number | null;
}

export interface StoreDocument {
  id?: string;
  kind: DocumentKind;
  uploadedAt: string;
  /** Só conhecidos no aparelho que enviou (a API não devolve o nome nem o tamanho do arquivo). */
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface Correction {
  /** Código do item: `store_data` ou o tipo do documento. */
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
  /** Comissão efetiva da loja em %, ou `null` se a API ainda não informa (pendência de contrato). */
  commissionPct?: number | null;
  /** Tarifa estimada do provedor (%) por meio de pagamento (DEC-074e); `null` = a API não informou (ou é funcionário). */
  providerFeePct?: { pix: number; card: number } | null;
  /** Maior etapa concluída (0 a 4), calculada do que a API diz que falta (WB-051 C4). */
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
  /** Itens que a API diz faltar para enviar (`ONBOARDING_INCOMPLETE`). */
  missing: { field: string; message: string }[];
  updatedAt: string;
}

export interface StoreDraftPatch {
  legalType?: LegalType;
  document?: string;
  legalName?: string;
  fiscalAccepted?: boolean;
  name?: string;
  categoryId?: string;
  whatsapp?: string;
  address?: StoreAddress;
}

export interface CepResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
}

export interface UploadPolicy {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
}

export interface TeamMember {
  /** `userId` do membro ou `id` do convite. */
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  permissions: string[];
  status: 'active' | 'invited';
  inviteExpiresAt: string | null;
}

/** Permissões que o dono pode dar a um funcionário (RN-13; `STAFF_ASSIGNABLE_PERMISSIONS` da API). */
export const STAFF_PERMISSIONS = [
  { id: 'orders', label: 'Pedidos' },
  { id: 'catalog', label: 'Catálogo e estoque' },
  { id: 'exchanges', label: 'Trocas' },
  { id: 'coupons', label: 'Cupons' },
  { id: 'reviews', label: 'Avaliações' },
] as const;

// ---- formato da API (controllers de apps/api/src/modules/stores)
interface ApiAddress {
  cep: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
}
interface ApiStore {
  id: string;
  status: Exclude<StoreStatus, 'live'>;
  documentType: LegalType;
  document: string;
  legalName: string | null;
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  mainCategoryId: string | null;
  address: ApiAddress | null;
  reviewItems: { item: string; reason: string }[];
  submittedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  role?: 'owner' | 'staff';
  /** Hoje só o dono recebe a lista; quando a API devolver a do funcionário, o painel passa a usá-la. */
  permissions?: string[];
  /** Comissão efetiva da loja (%), quando a API a devolve. Pendência de contrato: sem ela o "Você recebe" fica indisponível. */
  commissionPct?: number | null;
  providerFeePct?: { pix: number; card: number } | null;
  settings?: { hours: { weekday: number; intervals: unknown[] }[] };
}
interface ApiOnboarding {
  missing: { field: string; message: string }[];
  paymentAccount: unknown;
}
interface ApiPaymentView {
  connected: boolean;
  provider?: string;
  status?: 'active' | 'under_review';
  holderDocumentMasked?: string;
}

const DOCUMENT_KINDS: readonly string[] = ['id_front', 'id_back', 'address_proof', 'cnpj_card', 'responsible_id'];
const NO_NUMBER = 's/n';

function toAddress(address: ApiAddress | null): StoreAddress | null {
  if (!address) return null;
  const noNumber = (address.number ?? '').toLowerCase() === NO_NUMBER;
  return { cep: address.cep, street: address.street ?? '', number: noNumber ? '' : (address.number ?? ''), noNumber, complement: address.complement ?? '', neighborhood: address.neighborhood ?? '', city: address.city ?? '', state: address.state ?? '', lat: address.lat, lng: address.lng };
}

const stepsDone = (missing: { field: string }[], payoutConnected: boolean, hasStore: boolean): number => {
  if (!hasStore) return 0;
  const lacks = (test: (field: string) => boolean) => missing.some((m) => test(m.field));
  const step1 = !lacks((f) => f === 'legalName');
  const step2 = !lacks((f) => ['name', 'mainCategoryId', 'whatsapp', 'address'].includes(f));
  const step3 = !lacks((f) => f.startsWith('documents.'));
  if (!step1) return 0;
  if (!step2) return 1;
  if (!step3) return 2;
  return payoutConnected ? 4 : 3;
};

/** Junta `stores/mine`, documentos, pendências e conta de recebimento no modelo das telas. `null` = ainda sem loja. */
async function loadStore(): Promise<MerchantStore | null> {
  const mine = await apiRequest<{ data: ApiStore[] }>('lojista', 'stores/mine');
  const store = mine.data[0];
  if (!store) return null;
  const owner = store.role !== 'staff';
  const optional = <T>(call: Promise<T>): Promise<T | null> => call.catch(() => null);
  // O catálogo só abre com a loja aprovada (409 `STORE_NOT_APPROVED`): antes disso não há o que perguntar.
  const catalogOpen = store.status === 'approved';
  const [full, documents, onboarding, payment, activeProducts] = await Promise.all([
    owner ? optional(apiRequest<ApiStore>('lojista', `stores/${store.id}`)) : Promise.resolve(null),
    owner ? optional(apiRequest<{ data: { id: string; kind: string; uploadedAt: string; current: boolean }[] }>('lojista', `stores/${store.id}/documents`)) : Promise.resolve(null),
    owner ? optional(apiRequest<ApiOnboarding>('lojista', `stores/${store.id}/onboarding`)) : Promise.resolve(null),
    owner ? optional(apiRequest<ApiPaymentView>('lojista', `stores/${store.id}/payment-account`)) : Promise.resolve(null),
    catalogOpen ? optional(apiRequest<{ data: unknown[] }>('lojista', `stores/${store.id}/products`, { query: { status: 'active', limit: 1 } })) : Promise.resolve(null),
  ]);
  const view = { ...store, ...(full ?? {}) };
  const payout: MerchantStore['payout'] = payment?.connected ? { status: payment.status === 'under_review' ? 'under_review' : 'connected', maskedAccount: payment.holderDocumentMasked ? `Titular ${payment.holderDocumentMasked}` : null, simulated: payment.provider === 'fake' } : { status: 'not_connected', maskedAccount: null, simulated: false };
  const missing = onboarding?.missing ?? [];
  const lastDocs = (documents?.data ?? []).filter((doc) => doc.current && DOCUMENT_KINDS.includes(doc.kind));
  return {
    id: view.id,
    status: view.status,
    role: owner ? 'owner' : 'staff',
    permissions: store.permissions ?? [],
    commissionPct: store.commissionPct ?? null,
    providerFeePct: store.providerFeePct ?? null,
    step: stepsDone(missing, payout.status === 'connected', true),
    legalType: view.documentType,
    document: view.document,
    legalName: view.legalName,
    fiscalAccepted: view.documentType === 'cnpj' ? !missing.some((m) => m.field === 'legalName') : false,
    name: view.name,
    categoryId: view.mainCategoryId,
    whatsapp: view.whatsapp ?? view.phone,
    address: toAddress(view.address),
    documents: lastDocs.map((doc) => ({ id: doc.id, kind: doc.kind as DocumentKind, uploadedAt: doc.uploadedAt })),
    payout,
    submittedAt: view.submittedAt,
    decisionReason: view.decisionReason,
    corrections: view.reviewItems.map((item) => ({ id: item.item, target: item.item === 'store_data' ? { type: 'store_data' as const } : { type: 'document' as const, kind: item.item as DocumentKind }, message: item.reason, fixed: false })),
    hasActiveProduct: (activeProducts?.data.length ?? 0) > 0,
    hasHours: (full?.settings?.hours ?? []).some((day) => day.intervals.length > 0),
    slaBusinessDays: 2,
    missing,
    updatedAt: new Date().toISOString(),
  };
}

function profilePatch(patch: StoreDraftPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out['name'] = patch.name;
  if (patch.legalName !== undefined) out['legalName'] = patch.legalName;
  if (patch.fiscalAccepted !== undefined) out['fiscalResponsibilityAccepted'] = patch.fiscalAccepted;
  if (patch.categoryId !== undefined) out['mainCategoryId'] = patch.categoryId;
  if (patch.whatsapp !== undefined) out['whatsapp'] = patch.whatsapp;
  if (patch.address) {
    const a = patch.address;
    out['address'] = {
      cep: a.cep,
      number: a.noNumber ? NO_NUMBER : a.number,
      ...(a.complement ? { complement: a.complement } : {}),
      ...(a.street ? { street: a.street } : {}),
      ...(a.neighborhood ? { neighborhood: a.neighborhood } : {}),
      ...(a.city ? { city: a.city } : {}),
      ...(a.state ? { state: a.state } : {}),
      ...(a.lat !== null ? { lat: a.lat } : {}),
      ...(a.lng !== null ? { lng: a.lng } : {}),
    };
  }
  return out;
}

export const merchantApi = {
  /** `null` = ainda sem loja. */
  store: loadStore,
  /**
   * Salva o rascunho. Sem loja ainda: cria (etapa 1, `POST /stores`). Com loja: `PATCH /stores/:id/profile`. O CPF/CNPJ
   * não muda depois de criado (1 documento = 1 loja). Devolve a loja relida.
   */
  async saveDraft(current: MerchantStore | null, patch: StoreDraftPatch): Promise<MerchantStore | null> {
    if (!current) {
      await apiRequest('lojista', 'stores', {
        method: 'POST',
        body: { documentType: patch.legalType, documentNumber: patch.document, ...(patch.legalName ? { legalName: patch.legalName } : {}), ...(patch.fiscalAccepted ? { fiscalResponsibilityAccepted: true } : {}) },
      });
    } else {
      const body = profilePatch(patch);
      if (Object.keys(body).length > 0) await apiRequest('lojista', `stores/${current.id}/profile`, { method: 'PATCH', body });
    }
    return loadStore();
  },
  cep: (cep: string) => apiRequest<CepResult>('lojista', `cep/${cep}`),
  createUpload: (body: { storeId: string; purpose: 'store_document' | 'store_logo' | 'store_cover' | 'product_image'; contentType: string; sizeBytes: number }) =>
    apiRequest<{ id: string; upload: { url: string; fields: Record<string, string> } }>('lojista', 'uploads', { method: 'POST', body }).then((created): UploadPolicy => ({ uploadId: created.id, url: created.upload.url, fields: created.upload.fields })),
  completeUpload: (uploadId: string) => apiRequest<{ id: string; status: string; urls: Record<string, string> | null; rejectionReason: string | null }>('lojista', `uploads/${uploadId}/complete`, { method: 'POST' }),
  attachDocument: (storeId: string, kind: DocumentKind, uploadId: string) => apiRequest<void>('lojista', `stores/${storeId}/documents`, { method: 'POST', body: { kind, uploadId } }),
  /** Exige senha de até 5 min (`REAUTH_REQUIRED`): chame dentro de `useReauth().guard`. */
  connectPayout: (storeId: string) => apiRequest<{ authorizationUrl: string; state: string; expiresInSeconds: number }>('lojista', `stores/${storeId}/payment-account/connect`, { method: 'POST' }),
  async payoutCallback(storeId: string, body: { state: string; code: string }): Promise<MerchantStore['payout']> {
    const view = await apiRequest<ApiPaymentView>('lojista', `stores/${storeId}/payment-account/callback`, { method: 'POST', body });
    return { status: view.status === 'under_review' ? 'under_review' : 'connected', maskedAccount: view.holderDocumentMasked ? `Titular ${view.holderDocumentMasked}` : null, simulated: view.provider === 'fake' };
  },
  /** Primeiro envio e reenvio depois da correção usam a mesma rota. 422 `ONBOARDING_INCOMPLETE` lista o que falta. */
  submit: (storeId: string) => apiRequest<unknown>('lojista', `stores/${storeId}/submit`, { method: 'POST' }).then(loadStore),
  /** Ainda sem endpoint na API (pendência): lista de espera por e-mail para cadastro fechado e cidade não atendida. */
  waitlist: (body: { email: string; kind: 'merchant_signup' | 'city'; city?: string; consent: true }) => apiRequest<void>('lojista', 'waitlist', { method: 'POST', body }),
  becomeMerchant: (acceptedDocuments: { type: string; version: number }[]) => apiRequest<void>('lojista', 'me/merchant-role', { method: 'POST', body: { acceptedDocuments } }),
  verifyEmail: (code: string) => apiRequest<void>('lojista', 'auth/email/verify', { method: 'POST', body: { code } }),
  resendEmailCode: () => apiRequest<void>('lojista', 'auth/email/resend', { method: 'POST' }),
  async team(storeId: string): Promise<TeamMember[]> {
    const result = await apiRequest<{
      members: { userId: string; name: string; email: string; role: 'owner' | 'staff'; permissions: string[] }[];
      invitations: { id: string; email: string; name: string; permissions: string[]; expiresAt: string }[];
    }>('lojista', `stores/${storeId}/members`);
    return [
      ...result.members.map((m): TeamMember => ({ id: m.userId, name: m.name, email: m.email, role: m.role, permissions: m.permissions, status: 'active', inviteExpiresAt: null })),
      ...result.invitations.map((i): TeamMember => ({ id: i.id, name: i.name, email: i.email, role: 'staff', permissions: i.permissions, status: 'invited', inviteExpiresAt: i.expiresAt })),
    ];
  },
  invite: (storeId: string, body: { email: string; name: string; permissions: string[] }) => apiRequest<{ invitationId: string; expiresAt: string }>('lojista', `stores/${storeId}/members/invitations`, { method: 'POST', body }),
  revokeInvitation: (storeId: string, invitationId: string) => apiRequest<void>('lojista', `stores/${storeId}/members/invitations/${invitationId}`, { method: 'DELETE' }),
  setPermissions: (storeId: string, userId: string, permissions: string[]) => apiRequest<void>('lojista', `stores/${storeId}/members/${userId}`, { method: 'PATCH', body: { permissions } }),
  removeMember: (storeId: string, userId: string) => apiRequest<void>('lojista', `stores/${storeId}/members/${userId}`, { method: 'DELETE' }),
};

export interface LegalDoc {
  type: 'customer_terms' | 'merchant_terms' | 'privacy';
  version: number;
}

/** Versão vigente de cada documento legal (aceite versionado: o cliente envia o que mostrou ao usuário). */
export async function currentLegalRefs(types: LegalDoc['type'][]): Promise<LegalDoc[]> {
  return Promise.all(types.map((type) => apiRequest<LegalDoc>('lojista', `legal/${type}`).then((doc) => ({ type: doc.type, version: doc.version }))));
}
