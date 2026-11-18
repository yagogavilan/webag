import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
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
        <StoreProvider user={merchantUser}>{ui}</StoreProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { result, client };
}
