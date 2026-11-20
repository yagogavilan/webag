import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';
import { ApiError } from './problem';

/**
 * TanStack Query para dado de servidor (sem duplicar em store global). Rede ruim é o padrão:
 * retry só para falha de conexão e 5xx (com backoff), nunca para 4xx; refetch ao voltar o foco e a conexão.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 24 * 60 * 60_000,
        retry: (failureCount, error) =>
          failureCount < 2 && (!(error instanceof ApiError) || error.isConnectivity || error.kind === 'server'),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        networkMode: 'offlineFirst',
        refetchOnReconnect: true,
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

/** Liga o TanStack Query ao estado de rede e de foco do aparelho. Devolve a função que desfaz as ligações. */
export function wireQueryManagers(): () => void {
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((state) => {
      setOnline(!(state.isConnected === false || state.isInternetReachable === false));
    });
    return () => sub.remove();
  });
  const appState = AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
  });
  return () => appState.remove();
}
