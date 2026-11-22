'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys } from '@/lib/api/catalog';
import { newIntentKey, QUICK_MESSAGES } from '@/lib/catalog/quick';
import { asRoute } from '@/lib/routes';
import { useOnline } from '@/lib/use-online';

/**
 * Duplicar produto (WB-372, RN-Q4): cria um RASCUNHO "<nome> (cópia)" sem fotos, SKU, código de barras, estoque nem promoção e abre a
 * câmera para a foto da nova versão. A chave de idempotência vale por produto e por toque: duplo toque ou repetição em 3G gera 1 cópia.
 */
export function useDuplicate(storeId: string) {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const keys = useRef(new Map<string, string>());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function duplicate(productId: string): Promise<void> {
    if (busyId) return;
    if (!online) {
      setError(QUICK_MESSAGES.offlineTap);
      return;
    }
    setError(null);
    setBusyId(productId);
    const key = keys.current.get(productId) ?? newIntentKey('dup');
    keys.current.set(productId, key);
    try {
      const copy = await catalogApi.duplicate(storeId, productId, key);
      keys.current.delete(productId);
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show('Cópia criada sem fotos. Tire a foto desta versão.');
      router.push(asRoute(`/lojista/produtos/novo/${copy.id}?camera=1`));
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não conseguimos duplicar agora. Tente de novo.'));
    } finally {
      setBusyId(null);
    }
  }

  return { duplicate, busyId, error, clearError: () => setError(null) };
}
