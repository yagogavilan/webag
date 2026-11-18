import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ReauthProvider } from '@/components/panel/reauth';
import { StoreProvider } from '@/features/lojista/store-context';
import { ToastProvider } from '@/components/ui';
import type { MerchantStore } from '@/lib/api/lojista';
import type { Me } from '@/lib/session-types';

export const merchantUser: Me = { id: 'u1', email: 'marcos@casabela.com.br', emailVerified: true, name: 'Marcos Silva', phone: null, roles: ['customer', 'merchant'], adminProfile: null };

export function fakeStore(over: Partial<MerchantStore> = {}): MerchantStore {
  return {
    id: 's1',
    status: 'draft',
    role: 'owner',
    permissions: [],
    step: 0,
    legalType: null,
    document: null,
    legalName: null,
    fiscalAccepted: false,
    name: null,
    categoryId: null,
    whatsapp: null,
    address: null,
    documents: [],
    payout: { status: 'not_connected', maskedAccount: null, simulated: true },
    submittedAt: null,
    decisionReason: null,
    corrections: [],
    hasActiveProduct: false,
    hasHours: false,
    slaBusinessDays: 2,
    missing: [],
    updatedAt: '2026-11-18T17:32:00.000Z',
    ...over,
  };
}

/** Renderiza dentro dos provedores do painel do lojista (consultas, toasts e o contexto da loja). */
export function renderLojista(ui: ReactElement): { result: RenderResult; client: QueryClient } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReauthProvider area="lojista">
          <StoreProvider user={merchantUser}>{ui}</StoreProvider>
        </ReauthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { result, client };
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;
const respond = (body: unknown, status = 200): Response => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' } });

/**
 * Serve os endpoints reais do lojista (`stores/mine`, `stores/:id`, documentos, pendências e conta de recebimento) a partir
 * de um `MerchantStore`, para testar telas que leem a loja pela camada `merchantApi.store()`. `null` = sem loja.
 * As pendências são derivadas de `step`, como a API faria: 0 sem razão social, 1 sem dados, 2 sem documentos.
 */
export function storeHandlers(store: MerchantStore | null): Handler[] {
  if (!store) return [(url) => (url.pathname.endsWith('/stores/mine') ? respond({ data: [] }) : undefined)];
  const missing: { field: string; message: string }[] = [];
  if (store.step < 1) missing.push({ field: 'legalName', message: 'Informe a razão social.' });
  if (store.step < 2) for (const field of ['name', 'mainCategoryId', 'whatsapp', 'address']) missing.push({ field, message: `Falta ${field}.` });
  if (store.step < 3) missing.push({ field: 'documents.id_front', message: 'Falta o documento.' });
  const api = {
    id: store.id,
    status: store.status,
    documentType: store.legalType ?? 'cpf',
    document: store.document ?? '',
    legalName: store.legalName,
    name: store.name,
    phone: null,
    whatsapp: store.whatsapp,
    mainCategoryId: store.categoryId,
    address: store.address && { ...store.address, number: store.address.noNumber ? 's/n' : store.address.number },
    // A API só devolve os itens ainda abertos: o que o lojista já corrigiu some da lista.
    reviewItems: store.corrections.filter((c) => !c.fixed).map((c) => ({ item: c.id, reason: c.message })),
    submittedAt: store.submittedAt,
    decisionReason: store.decisionReason,
    createdAt: store.updatedAt,
    settings: { hours: store.hasHours ? [{ weekday: 1, intervals: [{ start: '09:00', end: '18:00' }] }] : [] },
  };
  const base = `/api/proxy/lojista/stores`;
  return [
    (url) => (url.pathname === `${base}/mine` ? respond({ data: [{ ...api, role: store.role }] }) : undefined),
    (url) => (url.pathname === `${base}/${store.id}` ? respond(api) : undefined),
    (url) => (url.pathname === `${base}/${store.id}/documents` ? respond({ data: store.documents.map((d) => ({ id: d.id ?? `doc-${d.kind}`, kind: d.kind, uploadedAt: d.uploadedAt, current: true })), nextCursor: null }) : undefined),
    (url) => (url.pathname === `${base}/${store.id}/onboarding` ? respond({ status: store.status, complete: false, missing, paymentAccount: null, history: [] }) : undefined),
    (url) =>
      url.pathname === `${base}/${store.id}/payment-account`
        ? respond(store.payout.status === 'not_connected' ? { connected: false } : { connected: true, provider: store.payout.simulated ? 'fake' : 'mercadopago', status: store.payout.status === 'under_review' ? 'under_review' : 'active', holderDocumentMasked: '***.982.247-**' })
        : undefined,
  ];
}
