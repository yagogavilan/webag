import { Redirect, Stack } from 'expo-router';
import { useAddresses } from '../../src/features/address/store';

/**
 * Área do cliente. Sem endereço atual o visitante cai em "Onde você quer receber?" (WB-001 C1): sem lojas não há o que mostrar.
 * Login NÃO é exigido aqui (WB-005); o grupo (auth) abre por ação do usuário.
 * `(tabs)` tem a barra inferior; loja, produto, resultados, sacola e favoritos abrem por cima, sem a barra.
 */
export default function CustomerLayout() {
  const addresses = useAddresses();
  if (addresses.status === 'ready' && addresses.currentId === null) return <Redirect href="/location" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
