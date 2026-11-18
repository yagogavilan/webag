import {
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
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
import { ToastProvider } from '../src/components/Toast';
import { theme } from '../src/theme';

void SplashScreen.preventAutoHideAsync();
configureApiClient({ baseUrl: API_URL });

/** Se as fontes não carregarem em 2 s, segue com a fonte do sistema (packages/tokens/README.md). */
const FONT_TIMEOUT_MS = 2_000;

const queryClient = createQueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  const [timedOut, setTimedOut] = useState(false);
  const session = useSession();
  const addresses = useAddresses();

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void sessionStore.bootstrap();
    void addressStore.hydrate();
    return wireQueryManagers();
  }, []);

  const ready = (fontsLoaded || fontError !== null || timedOut) && session.status !== 'loading' && addresses.status !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <StatusBar style="dark" />
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
