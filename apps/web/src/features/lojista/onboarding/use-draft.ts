'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { merchantApi, type MerchantStore, type StoreDraftPatch } from '@/lib/api/lojista';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { STORE_KEY } from '../store-context';

/** Salva o rascunho (PUT /me/store) e põe a resposta no cache: "Salvo às 14:32" vem de `updatedAt` do servidor. */
export function useSaveDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: StoreDraftPatch) => merchantApi.saveDraft(patch),
    onSuccess: (store) => client.setQueryData<MerchantStore | null>(STORE_KEY, store),
  });
}

export function draftErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.isNetwork) return 'Conecte-se para salvar. O que você digitou continua nesta tela.';
  return saveErrorMessage(error);
}
