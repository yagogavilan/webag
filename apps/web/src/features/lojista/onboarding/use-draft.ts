'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { merchantApi, type MerchantStore, type StoreDraftPatch } from '@/lib/api/lojista';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { STORE_KEY } from '../store-context';

/** Salva o rascunho (cria a loja na etapa 1; depois, PATCH do perfil), relê a loja e põe no cache. */
export function useSaveDraft(current: MerchantStore | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: StoreDraftPatch) => merchantApi.saveDraft(current, patch),
    onSuccess: (store) => client.setQueryData<MerchantStore | null>(STORE_KEY, store),
  });
}

export function draftErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.isNetwork) return 'Conecte-se para salvar. O que você digitou continua nesta tela.';
  return saveErrorMessage(error);
}
