import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/Toast';

const metrics = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

/** Render com os provedores do app (safe area, TanStack Query sem retry, toast). Só para testes. */
export async function renderScreen(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
