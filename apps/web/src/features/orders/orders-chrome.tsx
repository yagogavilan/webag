'use client';

import { SpeakerHigh, SpeakerSlash, WifiHigh, WifiSlash } from '@phosphor-icons/react';
import Link from 'next/link';
import { Banner, Button, cx } from '@/components/ui';
import { formatSyncAge } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOrdersRuntime } from './orders-runtime';
import s from './orders.module.css';

const T = (id: string) => ltid('orders', id);

/** Faixa de som no topo do painel (onda-4 P1): o navegador só libera áudio depois de um toque, então começa o turno com "Ligar som". */
export function SoundBanner() {
  const { enabled, sound, pending } = useOrdersRuntime();
  if (!enabled || sound.enabled) return null;
  if (!sound.supported) {
    return (
      <Banner tone="danger" testId={T('sound-banner')}>
        Este navegador não toca alertas sonoros. Abra o painel no Chrome, Edge ou Firefox para não perder pedidos.
      </Banner>
    );
  }
  const urgent = pending.length > 0;
  return (
    <Banner
      tone={urgent ? 'danger' : 'info'}
      testId={T('sound-banner')}
      action={
        <Button size="sm" onClick={() => void sound.enable()} data-testid={T('sound-enable')}>
          Ligar som
        </Button>
      }
    >
      {urgent ? 'Alertas sem som. Toque em Ligar som para não perder pedidos.' : 'Ligar alertas sonoros'}
    </Banner>
  );
}

/** Barra de status do painel: som (com som de teste) e "Sincronizado há 3 s". */
export function StatusBar() {
  const { sound, syncedAt, connectionLost } = useOrdersRuntime();
  const now = useNow(1000);
  async function test() {
    if (!sound.enabled) await sound.enable();
    sound.test();
  }
  return (
    <div className={s.statusBar} data-testid={T('status-bar')}>
      <div className={s.statusGroup}>
        <span className={cx('wb-text-body-strong', s.statusText, sound.enabled ? s.soundOn : s.soundOff)} data-testid={T('sound-status')}>
          {sound.enabled ? <SpeakerHigh size={24} aria-hidden="true" /> : <SpeakerSlash size={24} aria-hidden="true" />}
          {sound.enabled ? 'Som ligado' : 'Som desligado'}
        </span>
        <Button size="sm" variant="secondary" onClick={() => void test()} data-testid={T('sound-test')}>
          Tocar som de teste
        </Button>
      </div>
      <span className={cx('wb-text-caption', s.statusText)} role="status" data-testid={T('sync-status')}>
        {connectionLost ? <WifiSlash size={20} aria-hidden="true" /> : <WifiHigh size={20} aria-hidden="true" />}
        {syncedAt > 0 ? `${connectionLost ? 'Última atualização' : 'Sincronizado'} ${formatSyncAge(now - syncedAt)}` : 'Sincronizando…'}
      </span>
    </div>
  );
}

/** Subnavegação da área de pedidos: "Em andamento" e "Histórico" (P3). */
export function OrdersSubnav({ current }: { current: 'live' | 'history' }) {
  return (
    <nav className={s.subnav} aria-label="Pedidos">
      <Link href={asRoute('/lojista/pedidos')} className={cx('wb-text-body-strong', s.subnavLink)} aria-current={current === 'live' ? 'page' : undefined} data-testid="lojista.orders.nav-live">
        Em andamento
      </Link>
      <Link href={asRoute('/lojista/pedidos/historico')} className={cx('wb-text-body-strong', s.subnavLink)} aria-current={current === 'history' ? 'page' : undefined} data-testid="lojista.orders.nav-history">
        Histórico
      </Link>
    </nav>
  );
}
