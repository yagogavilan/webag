'use client';

import { CaretRight, Warning } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Badge, cx, ui } from '@/components/ui';
import { formatCents } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import type { StoreSettings } from '@/lib/api/store-settings';
import type { MerchantStore } from '@/lib/api/lojista';
import { ltid } from '@/lib/testid';
import { WEEK } from './hours-page';
import { PauseCard } from './pause-card';
import { SettingsScreen } from './settings-screen';
import s from './loja.module.css';

const T = (id: string) => ltid('minha-loja', id);

const pad = (value: string): string => value.replace(/^0/, '').replace(':00', 'h').replace(':', 'h');

/** "Seg a sex, 9h às 18h", "Todos os dias, 9h às 18h" ou a lista dia a dia; `null` sem horário. */
export function hoursSummary(hours: StoreSettings['hours']): string | null {
  const open = hours.filter((day) => day.intervals.length > 0);
  if (open.length === 0) return null;
  const first = open[0]!.intervals[0]!;
  const same = open.every((day) => day.intervals.length === 1 && day.intervals[0]!.start === first.start && day.intervals[0]!.end === first.end);
  const range = `${pad(first.start)} às ${pad(first.end)}`;
  const days = new Set(open.map((day) => day.weekday));
  if (same && days.size === 7) return `Todos os dias, ${range}`;
  if (same && days.size === 5 && [1, 2, 3, 4, 5].every((d) => days.has(d))) return `Seg a sex, ${range}`;
  return `${WEEK.filter((d) => days.has(d.weekday)).map((d) => d.label.slice(0, 3)).join(', ')}, ${same ? range : 'horários variados'}`;
}

export function StoreMenu() {
  return <SettingsScreen>{({ store, settings, refresh }) => <Menu store={store} settings={settings} refresh={refresh} />}</SettingsScreen>;
}

/** C1: estado da loja (pausar e reabrir) e a lista de seções com o resumo de cada uma. */
function Menu({ store, settings, refresh }: { store: MerchantStore; settings: StoreSettings; refresh: () => Promise<unknown> }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const hours = hoursSummary(settings.hours);
  const d = settings.delivery;
  const p = settings.pickup;
  const delivery = [d.acceptsDelivery ? `Entrega pela Webag${d.prepMinutes ? ` · preparo ${d.prepMinutes} min${d.prepMinutesIsDefault ? ' (padrão)' : ''}` : ''}` : null, p.enabled ? 'Retirada ligada' : null].filter(Boolean).join(' · ');
  const exchange = settings.exchangePolicy.voluntaryDays > 0 ? `Troca em até ${settings.exchangePolicy.voluntaryDays} dias${settings.exchangePolicy.collectionFeeCents > 0 ? ` · coleta ${formatCents(settings.exchangePolicy.collectionFeeCents)}` : ''}` : 'Sem troca por tamanho ou cor';
  const connected = store.payout.status === 'connected';
  const items: { id: string; href: string; title: string; summary: string; alert?: string }[] = [
    { id: 'profile', href: '/lojista/loja/perfil', title: 'Perfil da loja', summary: 'Logo, capa, descrição' },
    { id: 'hours', href: '/lojista/loja/horarios', title: 'Horários e pausa', summary: hours ?? 'Sem horário definido', ...(hours ? {} : { alert: 'Falta o horário' }) },
    { id: 'delivery', href: '/lojista/loja/entrega', title: 'Entrega e retirada', summary: delivery || 'Nada ligado' },
    { id: 'exchange', href: '/lojista/loja/trocas', title: 'Política de trocas', summary: exchange },
    { id: 'payout', href: '/lojista/onboarding/4', title: 'Recebimento', summary: connected ? (store.payout.maskedAccount ?? 'Conta conectada') : 'Conta não conectada', ...(connected ? {} : { alert: 'Falta conectar o Mercado Pago' }) },
    { id: 'team', href: '/lojista/equipe', title: 'Equipe', summary: 'Quem acessa o painel' },
  ];
  return (
    <div className={ui.stack}>
      <h1 ref={heading} className="wb-text-title1" tabIndex={-1} style={{ margin: 0, outline: 'none' }}>Minha loja</h1>
      <PauseCard storeId={store.id} settings={settings} refresh={refresh} screen="minha-loja" />
      <ul className={s.menuList}>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={asRoute(item.href)} className={s.menuItem} data-testid={T(`item-${item.id}`)}>
              <span className={s.menuText}>
                <span className="wb-text-body-strong">{item.title}</span>
                <span className={cx('wb-text-caption', ui.muted)}>{item.summary}</span>
              </span>
              <span className={ui.row} style={{ flexWrap: 'nowrap' }}>
                {item.alert ? <Badge tone="warning" icon={<Warning size={16} weight="fill" aria-hidden="true" />}>{item.alert}</Badge> : null}
                <CaretRight size={20} aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
