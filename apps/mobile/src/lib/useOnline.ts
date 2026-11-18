import { useNetworkState } from 'expo-network';

/**
 * Conectividade. Só afirma "offline" quando o sistema diz que não há rede: `undefined` (ainda não sabe) conta como online
 * para não bloquear o usuário por engano. Botões de escrita continuam ativos e explicam o motivo ao tocar (design-system.md §5.4).
 */
export function useOnline(): boolean {
  const state = useNetworkState();
  return !(state.isConnected === false || state.isInternetReachable === false);
}
