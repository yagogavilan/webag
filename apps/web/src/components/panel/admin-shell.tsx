'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionMenu, Banner, ToastProvider, cx, useToast, type SolarName } from '@/components/ui';
import { NAV_GROUP_LABEL, PROFILE_LABEL, bottomNav, visibleNav, type AdminSection, type NavGroupId } from '@/lib/admin-access';
import { onSessionLost, sessionRequest } from '@/lib/api/client';
import type { Me } from '@/lib/session-types';
import { createPanelQueryClient } from '@/lib/query-client';
import { useOnline } from '@/lib/use-online';
import { usePendingCounts } from '@/features/admin-home/pending';
import { AdminRealtimeProvider, useWaitingForCourier } from '@/features/logistics/nav-count';
import { IdleGuard } from './idle-guard';
import { PanelFrame, type AccountEntry, type FrameTestIds, type NavGroup } from './frame';
import { ReauthProvider } from './reauth';
import { SessionProvider } from './session-context';
import f from './frame.module.css';

const ICONS: Record<AdminSection, SolarName> = {
  inicio: 'chart',
  lojas: 'shield',
  logistica: 'scooter',
  estornos: 'wallet',
  frete: 'tag',
  comissoes: 'percent',
  trocas: 'exchange',
  moderacao: 'eye',
  regioes: 'map',
  categorias: 'layers',
  parametros: 'sliders',
  parametros_entrega: 'settings',
  flags: 'flag',
  termos: 'document',
  auditoria: 'clipboard',
  admins: 'team',
  banners: 'gallery',
  push: 'bell',
  cupons: 'ticket',
  relatorios: 'chart',
  denuncias: 'warning',
  ajuda: 'info',
  titulares: 'user',
  disputas: 'exchange',
};

const TEST_IDS: FrameTestIds = {
  side: (key) => `nav-${key}`,
  bottom: (key) => `nav-bottom-${key}`,
  more: (key) => `nav-more-${key}`,
  moreButton: 'nav-more',
  moreSheet: 'nav-more-sheet',
  moreSearch: 'nav-more-search',
  account: (key) => `nav-more-${key}`,
};

const GROUP_ORDER: NavGroupId[] = ['operation', 'money', 'marketing', 'area', 'system'];

function Frame({ user, children }: { user: Me; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const online = useOnline();
  const { waiting } = useWaitingForCourier();
  const pending = usePendingCounts();

  const logout = useCallback(
    async (reason?: 'inatividade' | 'expirada') => {
      try {
        await sessionRequest('admin', 'logout');
      } catch {
        /* cookies são limpos pelo servidor; segue para o login mesmo assim */
      }
      const params = new URLSearchParams();
      if (reason) params.set('motivo', reason);
      if (reason && pathname !== '/admin') params.set('next', pathname);
      router.replace(`/admin/entrar${params.size ? `?${params}` : ''}` as never);
    },
    [pathname, router],
  );

  useEffect(
    () =>
      onSessionLost((why) => {
        const params = new URLSearchParams({ motivo: why === 'idle' ? 'inatividade' : 'expirada' });
        if (pathname !== '/admin') params.set('next', pathname);
        router.replace(`/admin/entrar?${params}` as never);
      }),
    [pathname, router],
  );

  const wasOnline = useRef(true);
  useEffect(() => {
    if (online && !wasOnline.current) toast.show('Conectado de novo');
    wasOnline.current = online;
  }, [online, toast]);

  const profile = user.adminProfile;
  const groups = useMemo<NavGroup[]>(() => {
    const items = visibleNav(profile);
    return GROUP_ORDER.map((group) => ({
      label: NAV_GROUP_LABEL[group],
      items: items
        .filter((item) => item.group === group)
        .map((item) => ({
          key: item.section,
          label: item.label,
          ...(item.shortLabel ? { shortLabel: item.shortLabel } : {}),
          href: item.href,
          icon: ICONS[item.section],
          ...(item.section === 'logistica' ? { count: waiting.length, countLabel: (n: number) => `${n} esperando motoboy`, countTestId: 'admin.logistica.nav-count' } : {}),
          ...(item.section === 'lojas' && pending?.stores ? { count: pending.stores.inReview, countLabel: (n: number) => `${n} em análise`, countTestId: 'admin.lojas.nav-count' } : {}),
          ...(item.section === 'disputas' && pending?.disputes ? { count: pending.disputes.inMediation, countLabel: (n: number) => `${n} em mediação`, countTestId: 'admin.disputas.nav-count' } : {}),
          ...(item.section === 'estornos' && pending?.refunds ? { count: pending.refunds.needingAction, countLabel: (n: number) => `${n} pedem ação`, countTestId: 'admin.estornos.nav-count' } : {}),
          ...(item.section === 'titulares' && pending?.dataRequests ? { count: pending.dataRequests.open, countLabel: (n: number) => `${n} abertos`, countTestId: 'admin.titulares.nav-count' } : {}),
        })),
    })).filter((group) => group.items.length > 0);
  }, [profile, waiting.length, pending]);

  const account: AccountEntry[] = [
    { key: 'perfil', label: 'Meu perfil', hint: `${user.name} · ${profile ? PROFILE_LABEL[profile] : ''}`, icon: 'account', href: '/admin/perfil', testId: TEST_IDS.account('perfil') },
    { key: 'sair', label: 'Sair', icon: 'signOut', danger: true, onSelect: () => void logout(), testId: TEST_IDS.account('sair') },
  ];

  const userMenu = [
    { label: 'Meu perfil', onSelect: () => router.push('/admin/perfil' as never), testId: 'user-menu-profile' },
    { label: 'Sair', onSelect: () => void logout(), testId: 'user-menu-logout' },
  ];

  return (
    <PanelFrame
      root="/admin"
      homeAriaLabel="Webag, início da administração"
      pathname={pathname}
      pill={
        <span className={f.pill}>
          <span className={cx('wb-text-body-strong', f.pillText)}>Administração</span>
          {profile ? <span className={f.pillMeta}>{PROFILE_LABEL[profile]}</span> : null}
        </span>
      }
      actions={
        <span className={f.userPill}>
          <span className={cx('wb-text-caption', f.userName)} data-testid="user-name">
            {user.name} · {profile ? PROFILE_LABEL[profile] : ''}
          </span>
          <ActionMenu label={`Menu de ${user.name}`} actions={userMenu} testId="user-menu" />
        </span>
      }
      groups={groups}
      bottomKeys={bottomNav(profile).map((item) => item.section)}
      account={account}
      testIds={TEST_IDS}
      banners={!online ? <Banner tone="warning" offline testId="offline-banner">Sem conexão. Mostrando o que já carregou.</Banner> : null}
      idle={<IdleGuard onTimeout={() => void logout('inatividade')} />}
    >
      {children}
    </PanelFrame>
  );
}

export function AdminShell({ user, children }: { user: Me; children: ReactNode }) {
  const [client] = useState(createPanelQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReauthProvider>
          <SessionProvider user={user}>
            <AdminRealtimeProvider>
              <Frame user={user}>{children}</Frame>
            </AdminRealtimeProvider>
          </SessionProvider>
        </ReauthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
