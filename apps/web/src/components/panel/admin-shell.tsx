'use client';

import { ArrowsClockwise, ClipboardText, CurrencyCircleDollar, FileText, MapTrifold, Motorcycle, Percent, Flag, List, MapPin, ShieldCheck, SidebarSimple, Storefront, SlidersHorizontal, Tag, UsersThree, X } from '@phosphor-icons/react';
import { QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { ActionMenu, Banner, Logo, SpeedLines, ToastProvider, cx, ui, useToast } from '@/components/ui';
import { PROFILE_LABEL, visibleNav, type AdminSection } from '@/lib/admin-access';
import { onSessionLost, sessionRequest } from '@/lib/api/client';
import type { Me } from '@/lib/session-types';
import { createPanelQueryClient } from '@/lib/query-client';
import { useOnline } from '@/lib/use-online';
import { AdminRealtimeProvider, LogisticsNavCount } from '@/features/logistics/nav-count';
import { IdleGuard } from './idle-guard';
import { ReauthProvider } from './reauth';
import { SessionProvider } from './session-context';
import s from './shell.module.css';

type IconType = ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone'; 'aria-hidden'?: boolean | 'true' }>;

const ICONS: Record<AdminSection, IconType> = {
  lojas: Storefront,
  logistica: Motorcycle,
  estornos: CurrencyCircleDollar,
  frete: MapTrifold,
  comissoes: Percent,
  trocas: ArrowsClockwise,
  moderacao: ShieldCheck,
  regioes: MapPin,
  categorias: Tag,
  parametros: SlidersHorizontal,
  flags: Flag,
  termos: FileText,
  auditoria: ClipboardText,
  admins: UsersThree,
};

function Nav({ user, collapsed, onNavigate }: { user: Me; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = visibleNav(user.adminProfile);
  return (
    <nav className={s.nav} aria-label="Menu do painel">
      {items.map((item) => {
        const Icon = ICONS[item.section];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href as never} className={cx(s.navItem, 'wb-text-body-strong', active && s.navItemActive)} aria-current={active ? 'page' : undefined} onClick={onNavigate} title={collapsed ? item.label : undefined} data-testid={`nav-${item.section}`}>
            <Icon size={24} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
            <span className={s.navLabel}>{item.label}</span>
            {item.section === 'logistica' ? <LogisticsNavCount /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Frame({ user, children }: { user: Me; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const online = useOnline();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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

  const userMenu = [
    { label: 'Meu perfil', onSelect: () => router.push('/admin/perfil' as never), testId: 'user-menu-profile' },
    { label: 'Sair', onSelect: () => void logout(), testId: 'user-menu-logout' },
  ];

  return (
    <div className={s.shell}>
      <a href="#conteudo" className={cx(s.skip, 'wb-text-label')}>
        Pular para o conteúdo
      </a>
      <header className={s.header}>
        <button type="button" className={cx(ui.iconButton, s.burger)} aria-label="Abrir menu" aria-expanded={drawer} onClick={() => setDrawer(true)} data-testid="nav-open">
          <List size={24} aria-hidden="true" />
        </button>
        <SpeedLines className={s.headerLines} />
        <Link href="/admin" className={s.brand} aria-label="Webag, início da administração">
          <span className={s.logoFull}>
            <Logo size={36} tone="white" />
          </span>
          <span className={s.logoSym}>
            <Logo size={30} tone="white" compact />
          </span>
        </Link>
        <span className={cx('wb-text-label', s.badgeArea)}>Administração</span>
        <span className={s.spacer} />
        <span className={s.userPill}>
          <span className={cx('wb-text-caption', s.userName)} data-testid="user-name">
            {user.name} · {user.adminProfile ? PROFILE_LABEL[user.adminProfile] : ''}
          </span>
          <ActionMenu label={`Menu de ${user.name}`} actions={userMenu} testId="user-menu" />
        </span>
      </header>
      {!online ? <Banner tone="warning" offline testId="offline-banner">Sem conexão. Mostrando o que já carregou.</Banner> : null}
      <div className={s.body}>
        <aside className={cx(s.sidebar, collapsed && s.sidebarCollapsed)}>
          <Nav user={user} collapsed={collapsed} />
          <div className={s.sideLines}>
            <SpeedLines />
          </div>
          <button type="button" className={cx(ui.iconButton, s.collapse)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-pressed={collapsed} onClick={() => setCollapsed((v) => !v)}>
            <SidebarSimple size={24} aria-hidden="true" />
          </button>
        </aside>
        {drawer ? (
          <>
            <div className={s.drawerBackdrop} onClick={() => setDrawer(false)} aria-hidden="true" />
            <div className={s.drawer} role="dialog" aria-modal="true" aria-label="Menu" onKeyDown={(event) => event.key === 'Escape' && setDrawer(false)}>
              <button type="button" className={ui.iconButton} aria-label="Fechar menu" onClick={() => setDrawer(false)} autoFocus>
                <X size={24} aria-hidden="true" />
              </button>
              <Nav user={user} onNavigate={() => setDrawer(false)} />
            </div>
          </>
        ) : null}
        <main id="conteudo" className={s.main} tabIndex={-1}>
          <div className={s.content}>{children}</div>
        </main>
      </div>
      <IdleGuard onTimeout={() => void logout('inatividade')} />
    </div>
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
