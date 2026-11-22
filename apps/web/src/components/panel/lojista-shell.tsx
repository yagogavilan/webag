'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { OrderAlertHost } from '@/features/orders/order-alert';
import { SoundBanner } from '@/features/orders/orders-chrome';
import { OrdersRuntimeProvider, useOrdersRuntime } from '@/features/orders/orders-runtime';
import { StoreProvider, useMerchant } from '@/features/lojista/store-context';
import { hasUnsentCopies, purgeLocalCopies } from '@/lib/catalog/local-copy';
import { ReauthProvider } from './reauth';
import { PanelFrame, type AccountEntry, type FrameTestIds, type NavGroup } from './frame';
import { Banner, SolarIcon, ToastProvider, cx, useToast } from '@/components/ui';
import { onSessionLost, sessionRequest } from '@/lib/api/client';
import { LOJISTA_NAV_GROUP_LABEL, STORE_STATUS_LABEL, bottomLojistaNav, visibleLojistaNav, type LojistaSection } from '@/lib/lojista-access';
import { createPanelQueryClient } from '@/lib/query-client';
import type { Me } from '@/lib/session-types';
import { useOnline } from '@/lib/use-online';
import { LojistaMaintenanceBanner } from './maintenance-banner';
import f from './frame.module.css';

const ICONS = { inicio: 'home', pedidos: 'orders', trocas: 'exchange', produtos: 'box', financeiro: 'wallet', loja: 'store', equipe: 'team', avaliacoes: 'star' } as const satisfies Record<LojistaSection, string>;

const TEST_IDS: FrameTestIds = {
  side: (key) => `lojista.nav.${key}`,
  bottom: (key) => `lojista.nav.${key}-bottom`,
  more: (key) => `lojista.nav.more.${key}`,
  moreButton: 'lojista.nav.more',
  moreSheet: 'lojista.nav.more-sheet',
  moreSearch: 'lojista.nav.more-search',
  account: (key) => `lojista.nav.more.${key}`,
};

/** Sessão perdida, sair e aviso de volta à rede: comportamento comum ao painel e ao fluxo de cadastro. */
function useShellBehavior(userId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const online = useOnline();

  const logout = useCallback(async () => {
    // RN-Q2: produto digitado e ainda não enviado fica só neste aparelho; ao sair ele é apagado, e o lojista é avisado antes.
    if (hasUnsentCopies(userId) && !window.confirm('Você tem produto ou lista ainda não enviados neste aparelho. Se sair, eles serão apagados. Sair mesmo?')) return;
    try {
      await sessionRequest('lojista', 'logout');
    } catch {
      /* os cookies são limpos pelo servidor; segue para o login mesmo assim */
    }
    purgeLocalCopies();
    router.replace('/lojista/entrar');
  }, [router, userId]);

  useEffect(
    () =>
      onSessionLost((why) => {
        const params = new URLSearchParams({ motivo: why === 'idle' ? 'inatividade' : 'expirada' });
        if (pathname !== '/lojista') params.set('next', pathname);
        router.replace(`/lojista/entrar?${params}` as never);
      }),
    [pathname, router],
  );

  const wasOnline = useRef(true);
  useEffect(() => {
    if (online && !wasOnline.current) toast.show('Conectado de novo');
    wasOnline.current = online;
  }, [online, toast]);

  return { logout, online, pathname };
}

/** Pastilha noite do cabeçalho: ponto de estado + nome da loja + estado ("Moda Morato · Aberta"). */
function StorePill() {
  const { store } = useMerchant();
  const data = store.data;
  if (!data) return null;
  const label = data.status === 'live' ? 'Aberta' : STORE_STATUS_LABEL[data.status];
  const tone = data.status === 'live' ? 'var(--wb-color-accent-base)' : data.status === 'suspended' || data.status === 'rejected' ? 'var(--wb-color-feedback-danger-border)' : 'var(--wb-color-border-default)';
  return (
    <span className={f.pill}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: tone, flex: 'none' }} />
      <span className={cx('wb-text-body-strong', f.pillText)}>{data.name}</span>
      <span className={f.pillMeta} data-testid="lojista.shell.status-chip">{label}</span>
    </span>
  );
}

/** Faixa global: no máximo uma por vez, por prioridade (§0.6): loja suspensa, depois sem conexão. */
function GlobalBanner({ online }: { online: boolean }) {
  const { store } = useMerchant();
  if (store.data?.status === 'suspended') {
    return (
      <Banner tone="danger" testId="lojista.shell.suspended-banner">
        Sua loja foi suspensa. Pedidos em andamento continuam visíveis.
      </Banner>
    );
  }
  if (!online) {
    return (
      <Banner tone="warning" offline testId="lojista.shell.offline-banner">
        Sem conexão. Mostrando o que já carregou.
      </Banner>
    );
  }
  return null;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || 'W';

function HeaderActions({ user, onLogout }: { user: Me; onLogout: () => void }) {
  return (
    <>
      <Link href={'/lojista/ajuda' as never} className={f.heroButton} aria-label="Ajuda" data-testid="lojista.shell.help">
        <SolarIcon name="help" size={24} />
      </Link>
      <button type="button" className={f.heroButton} onClick={onLogout} data-testid="lojista.shell.logout">
        <SolarIcon name="signOut" size={22} />
        <span className="wb-text-label">Sair</span>
      </button>
      <Link href={'/lojista/conta' as never} className={f.heroAvatar} aria-label="Minha conta" data-testid="lojista.shell.account">
        {initials(user.name)}
      </Link>
    </>
  );
}

function PanelShell({ user, flow, pendingCount, children }: { user: Me; flow?: boolean; pendingCount: number; children: ReactNode }) {
  const { logout, online, pathname } = useShellBehavior(user.id);
  const { store } = useMerchant();

  const groups = useMemo<NavGroup[]>(() => {
    const visible = visibleLojistaNav(store.data);
    return (['day', 'store'] as const)
      .map((group) => ({
        label: LOJISTA_NAV_GROUP_LABEL[group],
        items: visible
          .filter((item) => item.group === group)
          .map((item) => ({
            key: item.section,
            label: item.label,
            href: item.href,
            icon: ICONS[item.section],
            ...(item.section === 'pedidos' ? { count: pendingCount, countLabel: (n: number) => `${n} ${n === 1 ? 'pedido novo' : 'pedidos novos'}`, countTestId: 'lojista.nav.pedidos-count' } : {}),
          })),
      }))
      .filter((group) => group.items.length > 0);
  }, [store.data, pendingCount]);

  const account: AccountEntry[] = [
    { key: 'ajuda', label: 'Ajuda', icon: 'help', href: '/lojista/ajuda', testId: TEST_IDS.account('ajuda') },
    { key: 'conta', label: 'Minha conta', hint: user.name, icon: 'account', href: '/lojista/conta', testId: TEST_IDS.account('conta') },
    { key: 'sair', label: 'Sair', icon: 'signOut', danger: true, onSelect: () => void logout(), testId: TEST_IDS.account('sair') },
  ];

  return (
    <PanelFrame
      root="/lojista"
      homeAriaLabel="Webag, início do painel da loja"
      pathname={pathname}
      flow={flow}
      pill={<StorePill />}
      actions={<HeaderActions user={user} onLogout={() => void logout()} />}
      groups={flow ? [] : groups}
      bottomKeys={bottomLojistaNav(store.data).map((item) => item.section)}
      account={account}
      testIds={TEST_IDS}
      banners={
        <>
          <GlobalBanner online={online} />
          {flow ? null : <LojistaMaintenanceBanner />}
          {flow ? null : <SoundBanner />}
        </>
      }
      overlay={flow ? null : <OrderAlertHost />}
    >
      {children}
    </PanelFrame>
  );
}

function RuntimeShell({ user, children }: { user: Me; children: ReactNode }) {
  const { pending } = useOrdersRuntime();
  return <PanelShell user={user} pendingCount={pending.length}>{children}</PanelShell>;
}

function Providers({ user, children }: { user: Me; children: ReactNode }) {
  const [client] = useState(createPanelQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReauthProvider area="lojista">
          <StoreProvider user={user}>{children}</StoreProvider>
        </ReauthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Painel completo (barra lateral no balcão, barra inferior de 4 + "Mais" no celular). */
export function LojistaShell({ user, children }: { user: Me; children: ReactNode }) {
  return (
    <Providers user={user}>
      <OrdersRuntimeProvider>
        <RuntimeShell user={user}>{children}</RuntimeShell>
      </OrdersRuntimeProvider>
    </Providers>
  );
}

/** Moldura enxuta do cadastro da loja (L3 a L7): sem menu, para o lojista não se perder no meio. */
export function LojistaFlowShell({ user, children }: { user: Me; children: ReactNode }) {
  return (
    <Providers user={user}>
      <PanelShell user={user} flow pendingCount={0}>{children}</PanelShell>
    </Providers>
  );
}
