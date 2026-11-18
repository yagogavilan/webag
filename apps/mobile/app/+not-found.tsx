import { Redirect } from 'expo-router';

/**
 * SEC-126: rota inexistente (link `webag://qualquer-coisa`, link antigo) volta ao início. Regra de deep link do app:
 * um link só ABRE tela; nunca executa ação (pagar, aplicar cupom, apagar). Sem tela de erro do Expo Router.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
