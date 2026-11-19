'use client';

import { SpeakerHigh, SpeakerSlash, WifiHigh, WifiSlash } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, cx } from '@/components/ui';
import { formatSyncAge } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOrdersRuntime } from './orders-runtime';
import s from './orders.module.css';

const T = (id: string) => ltid('orders', id);

/** O banner de som só faz sentido onde o lojista espera pedido: Início e Pedidos (U8.7). Em Produtos, Trocas, Avaliações e Minha loja atrapalha. */
const SOUND_BANNER_PATHS = new Set(['/lojista', '/lojista/pedidos']);

/** "Agora não" vale para o turno todo (até recarregar a página). */
let bannerDismissedThisShift = false;

/** Faixa de som no topo do painel (onda-4 P1): o navegador só libera áudio depois de um toque, então começa o turno com "Ligar som". */
export function SoundBanner() {
  const { enabled, sound, pending } = useOrdersRuntime();
  const pathname = usePathname();
  const [, rerender] = useState(0);
  if (!enabled || sound.enabled || !SOUND_BANNER_PATHS.has(pathname)) return null;
  if (!sound.supported) {
    return (
      <Banner tone="danger" testId={T('sound-banner')}>
        Este navegador não toca alertas sonoros. Abra o painel no Chrome, Edge ou Firefox para não perder pedidos.
      </Banner>
    );
  }
  // Com pedido novo esperando, o alerta em tela cheia já traz a faixa "Alertas sem som" com o botão: repetir aqui empurra Aceitar para fora da tela.
  if (pending.length > 0 || bannerDismissedThisShift) return null;
  return (
    <Banner
      tone="info"
      testId={T('sound-banner')}
      action={
        <span className={s.bannerActions}>
          <Button size="sm" onClick={() => void sound.enable()} data-testid={T('sound-enable')}>
            Ligar som
          </Button>
          <Button
            size="sm"
            variant="text"
            onClick={() => {
              bannerDismissedThisShift = true;
              rerender((n) => n + 1);
            }}
            data-testid={T('sound-dismiss')}
          >
            Agora não
          </Button>
        </span>
      }
    >
      Ligar alertas sonoros para ouvir quando chegar pedido
    </Banner>
  );
}

/**
 * Barra de status do painel: UM controle de som (ícone + estado) e "Sincronizado há 3 s" na mesma linha (U8.7).
 * Desligado, o toque liga o som; ligado, o toque toca o som de teste.
 */
export function StatusBar() {
  const { sound, syncedAt, connectionLost } = useOrdersRuntime();
  const now = useNow(1000);
  async function toggle() {
    if (!sound.enabled) await sound.enable();
    sound.test();
  }
  const label = sound.enabled ? 'Som ligado' : 'Som desligado';
  return (
    <div className={s.statusBar} data-testid={T('status-bar')}>
      <button
        type="button"
        className={cx('wb-text-body-strong', s.soundControl, sound.enabled ? s.soundOn : s.soundOff)}
        onClick={() => void toggle()}
        aria-label={sound.enabled ? 'Som ligado. Toque para ouvir o som de teste.' : 'Som desligado. Toque para ligar e ouvir o som de teste.'}
        data-testid={T('sound-test')}
      >
        {sound.enabled ? <SpeakerHigh size={24} aria-hidden="true" /> : <SpeakerSlash size={24} aria-hidden="true" />}
        <span data-testid={T('sound-status')}>{label}</span>
      </button>
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
