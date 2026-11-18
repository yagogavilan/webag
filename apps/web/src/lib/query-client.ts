import { QueryClient } from '@tanstack/react-query';

/** Não repete erro 4xx (o servidor já respondeu); rede e 5xx tentam até 2 vezes com backoff do TanStack. */
export function createPanelQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => count < 2 && !(error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: true,
      },
    },
  });
}
