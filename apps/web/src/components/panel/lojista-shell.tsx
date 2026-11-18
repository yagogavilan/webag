'use client';

import { House, Package, Question, SignOut, Storefront, UsersThree } from '@phosphor-icons/react';
import { QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { StoreProvider, useMerchant } from '@/features/lojista/store-context';
import { ReauthProvider } from './reauth';
import { Badge, Banner, Logo, ToastProvider, cx, useToast } from '@/components/ui';
import { onSessionLost, sessionRequest } from '@/lib/api/client';
import { STORE_STATUS_LABEL, supportHref, visibleLojistaNav, type LojistaSection } from '@/lib/lojista-access';
import { createPanelQueryClient } from '@/lib/query-client';
import type { Me } from '@/lib/session-types';
import { useOnline } from '@/lib/use-online';
import s from './lojista-shell.module.css';

type IconType = ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone'; 'aria-hidden'?: boolean | 'true' }>;
const ICONS: Record<LojistaSection, IconType> = { inicio: House, produtos: Package, loja: Storefront, equipe: UsersThree };

/** Sessão perdida, sair e aviso de volta à rede: comportamento comum ao painel e ao fluxo de cadastro. */
function useShellBehavior() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const online = useOnline();

  const logout = useCallback(async () => {
    try {
      await sessionRequest('lojista', 'logout');
    } catch {
      /* os cookies são limpos pelo servidor; segue para o login mesmo assim */
    }
    router.replace('/lojista/entrar');
  }, [router]);

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

  return { logout, online };
}

function StatusChip() {
  const { store } = useMerchant();
  const data = store.data;
  if (!data) return null;
  const tone = data.status === 'live' ? 'success' : data.status === 'suspended' || data.status === 'rejected' ? 'danger' : data.status === 'correction_requested' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} testId="lojista.shell.status-chip">
      {data.status === 'live' ? 'Aberta' : STORE_STATUS_LABEL[data.status]}
    </Badge>
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

function HeaderActions({ onLogout }: { onLogout: () => void }) {
  return (
    <>
      <a href={supportHref()} target="_blank" rel="noopener noreferrer" className={s.headerLink} aria-label="Ajuda (abre o WhatsApp do Webag)" data-testid="lojista.shell.help">
        <Question size={24} aria-hidden="true" />
        <span className={cx('wb-text-label', s.headerLabel)}>Ajuda</span>
      </a>
      <button type="button" className={s.headerLink} onClick={onLogout} data-testid="lojista.shell.logout">
        <SignOut size={24} aria-hidden="true" />
        <span className={cx('wb-text-label', s.headerLabel)}>Sair</span>
      </button>
    </>
  );
}

function Nav({ variant }: { variant: 'side' | 'bottom' }) {
  const pathname = usePathname();
  const { store } = useMerchant();
  const items = visibleLojistaNav(store.data);
  return (
    <nav className={variant === 'side' ? s.nav : undefined} style={variant === 'bottom' ? { display: 'flex', width: '100%' } : undefined} aria-label={variant === 'side' ? 'Menu do painel' : 'Menu principal'}>
      {items.map((item) => {
        const Icon = ICONS[item.section];
        const active = item.href === '/lojista' ? pathname === '/lojista' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href as never} className={cx(variant === 'side' ? s.navItem : s.bottomItem, variant === 'side' ? 'wb-text-body-strong' : 'wb-text-caption-strong', active && (variant === 'side' ? s.navItemActive : s.bottomItemActive))} aria-current={active ? 'page' : undefined} data-testid={`lojista.nav.${item.section}${variant === 'bottom' ? '-bottom' : ''}`}>
            <Icon size={24} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Header({ onLogout }: { onLogout: () => void }) {
  const { store } = useMerchant();
  return (
    <header className={s.header}>
      <Link href="/lojista" className={s.brand} aria-label="Webag, início do painel da loja">
        <Logo size={32} />
        {store.data?.name ? <span className={cx('wb-text-body-strong', s.storeName)}>{store.data.name}</span> : null}
      </Link>
      <StatusChip />
      <span className={s.spacer} />
      <HeaderActions onLogout={onLogout} />
    </header>
  );
}

function PanelFrame({ children }: { children: ReactNode }) {
  const { logout, online } = useShellBehavior();
  return (
    <div className={s.shell}>
      <a href="#conteudo" className={cx(s.skip, 'wb-text-label')}>
        Pular para o conteúdo
      </a>
      <Header onLogout={() => void logout()} />
      <div className={s.banners}>
        <GlobalBanner online={online} />
      </div>
      <div className={s.body}>
        <aside className={s.sidebar}>
          <Nav variant="side" />
        </aside>
        <main id="conteudo" className={s.main} tabIndex={-1}>
          <div className={s.content}>{children}</div>
        </main>
      </div>
      <div className={s.bottomBar}>
        <Nav variant="bottom" />
      </div>
    </div>
  );
}

function FlowFrame({ children }: { children: ReactNode }) {
  const { logout, online } = useShellBehavior();
  return (
    <div className={s.shell}>
      <a href="#conteudo" className={cx(s.skip, 'wb-text-label')}>
        Pular para o conteúdo
      </a>
      <Header onLogout={() => void logout()} />
      <div className={s.banners}>
        <GlobalBanner online={online} />
      </div>
      <main id="conteudo" className={s.flowMain} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
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

/** Painel completo (barra lateral no balcão, barra inferior no celular). */
export function LojistaShell({ user, children }: { user: Me; children: ReactNode }) {
  return (
    <Providers user={user}>
      <PanelFrame>{children}</PanelFrame>
    </Providers>
  );
}

/** Moldura enxuta do cadastro da loja (L3 a L7): sem menu, para o lojista não se perder no meio. */
export function LojistaFlowShell({ user, children }: { user: Me; children: ReactNode }) {
  return (
    <Providers user={user}>
      <FlowFrame>{children}</FlowFrame>
    </Providers>
  );
}
