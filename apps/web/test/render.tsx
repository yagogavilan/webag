import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ReauthProvider } from '@/components/panel/reauth';
import { SessionProvider } from '@/components/panel/session-context';
import { ToastProvider } from '@/components/ui';
import type { AdminProfile, Me } from '@/lib/session-types';

export function makeUser(profile: AdminProfile = 'super_admin'): Me {
  return { id: 'u-1', email: 'ana@webag.local', emailVerified: true, name: 'Ana Souza', phone: null, roles: ['customer'], adminProfile: profile };
}

/** Renderiza dentro dos provedores do painel (sessão, consultas, toasts, reautenticação). */
export function renderPanel(ui: ReactElement, profile: AdminProfile = 'super_admin'): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReauthProvider>
          <SessionProvider user={makeUser(profile)}>{ui}</SessionProvider>
        </ReauthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;

/** `fetch` falso: cada handler recebe a URL do BFF e devolve a resposta ou `undefined` para passar ao próximo. */
export function mockFetch(...handlers: Handler[]) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const impl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    calls.push({ url, init });
    for (const handler of handlers) {
      const response = await handler(url, init);
      if (response) return response;
    }
    return json({ code: 'NOT_FOUND', title: 'x', status: 404 }, 404);
  };
  return { impl, calls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' } });
}

export const path = (url: URL) => url.pathname.replace('/api/proxy/admin/', '');
