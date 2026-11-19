import type { AccountDeletionOverview, DataExportStatus, DataExportStatusResponse } from '@webag/shared';
import { apiRequest, type Area } from './client';

/**
 * Conta no painel (WB-212, WB-213, SEC-096): exportar os dados e excluir a conta, só com a senha. As mesmas rotas `/me/...` servem o
 * lojista e o admin; o admin não exclui a conta pelo painel (403 `ADMIN_ACCOUNT_NOT_DELETABLE`).
 */
export type { AccountDeletionOverview, DataExportStatus, DataExportStatusResponse };
export interface DeleteAccountResult {
  status: 'completed' | 'pending';
  effectiveAt: string;
  cancelableUntil: string | null;
}

export const accountApi = {
  deletion: (area: Area) => apiRequest<AccountDeletionOverview>(area, 'me/deletion'),
  deleteAccount: (area: Area, password: string) => apiRequest<DeleteAccountResult>(area, 'me/deletion', { method: 'POST', body: { password } }),
  exportStatus: (area: Area) => apiRequest<DataExportStatusResponse>(area, 'me/data-exports'),
  requestExport: (area: Area, password: string) => apiRequest<DataExportStatus>(area, 'me/data-exports', { method: 'POST', body: { password } }),
  downloadLink: (area: Area, exportId: string) => apiRequest<{ url: string; expiresAt: string }>(area, `me/data-exports/${exportId}/download-link`, { method: 'POST' }),
};

export const accountKeys = {
  deletion: (area: Area) => ['account', area, 'deletion'] as const,
  export: (area: Area) => ['account', area, 'export'] as const,
};

/** Texto de cada impedimento da exclusão (a tela monta "Pedido #4821 · saiu para entrega"). */
export const BLOCKER_LABEL: Record<AccountDeletionOverview['blockers'][number]['kind'], string> = {
  order: 'Pedido',
  exchange: 'Troca',
  store_order: 'Pedido da loja',
  store_exchange: 'Troca da loja',
  store_refund: 'Estorno da loja',
};
