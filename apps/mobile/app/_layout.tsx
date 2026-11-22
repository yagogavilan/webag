// Primeiro import: reservas de crypto.randomUUID/clipboard para o navegador em http na rede local (no app nativo não faz nada).
import '../src/lib/web-insecure-context';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import {
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { configureApiClient } from '@webag/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { API_URL } from '../src/api/config';
import { createQueryClient, wireQueryManagers } from '../src/api/query-client';
import { sessionStore, useSession } from '../src/api/session';
import { addressStore, useAddresses } from '../src/features/address/store';
import { syncAddresses } from '../src/features/address/sync';
import { ToastProvider, useToast } from '../src/components/Toast';
import { registerCartCleanup, useMergeGuestCart } from '../src/features/cart/hooks';
import { cartActions, cartStore } from '../src/features/cart/store';
import { modeStore } from '../src/features/catalog/queries';
import { usePushOpenHandler } from '../src/features/notifications/open';
import { registerFavoritesCleanup } from '../src/features/favorites/hooks';
import { searchHistoryStore } from '../src/features/search/history';
import { t } from '../src/i18n';
import { theme } from '../src/theme';

void SplashScreen.preventAutoHideAsync();
configureApiClient({ baseUrl: API_URL });

/** Se as fontes não carregarem em 2 s, segue com a fonte do sistema (packages/tokens/README.md). */
const FONT_TIMEOUT_MS = 2_000;

const queryClient = createQueryClient();
registerFavoritesCleanup(queryClient);
registerCartCleanup(queryClient);

/** Sacola parada há 7 dias é esvaziada ao abrir o app, com aviso único (onda-4 S1 Vazio). */
function CartExpiredNotice({ expired }: { expired: boolean }) {
  const toast = useToast();
  useEffect(() => {
    if (expired) toast.show(t('cart.expired'));
  }, [expired, toast]);
  return null;
}

/** Entrou na conta: a sacola de visitante vai para o servidor; se a da conta é de outra loja, ela fica e o usuário é avisado. */
function CartMerge() {
  const toast = useToast();
  useMergeGuestCart(toast.show);
  return null;
}

/** Toque em push: conta a abertura da campanha e abre o pedido/troca. */
function PushOpen() {
  usePushOpenHandler();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const [timedOut, setTimedOut] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [cartExpired, setCartExpired] = useState(false);
  const session = useSession();
  const addresses = useAddresses();

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void sessionStore.bootstrap();
    void addressStore.hydrate();
    void Promise.all([modeStore.hydrate(), cartStore.hydrate(), searchHistoryStore.hydrate()])
      .then(() => cartActions.expireIfStale())
      .then(setCartExpired)
      .finally(() => setLocalReady(true));
    return wireQueryManagers();
  }, []);

  // Logado: a lista de endereços vem da API (cache local). Anônimo: o cache de outro usuário não fica (SEC-122).
  const userId = session.status === 'authenticated' ? session.user.id : null;
  const anonymous = session.status === 'anonymous';
  const addressesReady = addresses.status === 'ready';
  useEffect(() => {
    if (!addressesReady) return;
    if (userId) void syncAddresses(userId);
    else if (anonymous) void addressStore.bindOwner(null);
  }, [userId, anonymous, addressesReady]);

  const ready = (fontsLoaded || fontError !== null || timedOut) && session.status !== 'loading' && addresses.status !== 'loading' && localReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <StatusBar style="dark" />
          <CartExpiredNotice expired={cartExpired} />
          <CartMerge />
          <PushOpen />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.color.surface.background },
            }}
          />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
