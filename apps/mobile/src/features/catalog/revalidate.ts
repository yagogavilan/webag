import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Ao VOLTAR para a tela (ex.: da página do produto para a loja, que continua montada embaixo na pilha), revalida em silêncio o que
 * já passou do `staleTime` (BUG-033, DEC-117). `stale: true` respeita o prazo: dentro de 5 s não pede nada. O dado antigo fica na
 * tela e é trocado quando a resposta chega (sem skeleton, sem piscar). Só quem já tem dado: erro sem dado tem o seu "tentar de novo" e não entra em laço de repetição. A 1ª vez em foco é a montagem, que o `useQuery` já cobre; a volta
 * do app do segundo plano é coberta pelo `focusManager` (refetchOnWindowFocus).
 */
export function useRevalidateOnFocus(keys: readonly QueryKey[]): void {
  const client = useQueryClient();
  const first = useRef(true);
  const serialized = JSON.stringify(keys);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      for (const queryKey of JSON.parse(serialized) as QueryKey[]) void client.refetchQueries({ queryKey, stale: true, type: 'active', predicate: (q) => q.state.data !== undefined }, { cancelRefetch: false });
    }, [client, serialized]),
  );
}
