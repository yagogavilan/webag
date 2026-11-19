'use client';

import Link from 'next/link';
import { Kpi, Lima, NightBlock, LimaAction } from '@/components/panel/blocks';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { SolarIcon, cx, type SolarName } from '@/components/ui';
import { NAV_GROUP_LABEL, PROFILE_LABEL, visibleNav, type AdminSection, type NavGroupId } from '@/lib/admin-access';
import type { PendingCounts } from '@/lib/api/admin';
import { useWaitingForCourier } from '@/features/logistics/nav-count';
import { usePendingCounts } from './pending';
import s from './admin-home.module.css';

const ICONS: Record<string, SolarName> = {
  lojas: 'shield', logistica: 'scooter', estornos: 'wallet', frete: 'tag', comissoes: 'percent', trocas: 'exchange', moderacao: 'eye', regioes: 'map', categorias: 'layers',
  parametros: 'sliders', parametros_entrega: 'settings', flags: 'flag', termos: 'document', auditoria: 'clipboard', admins: 'team', banners: 'gallery', push: 'bell', cupons: 'ticket', relatorios: 'chart',
  denuncias: 'warning', ajuda: 'info', titulares: 'user', disputas: 'exchange', alertas: 'alert', pedidos: 'orders', usuarios: 'account', manutencao: 'settings',
};

/** Início do admin (RL2): atalhos para as áreas do perfil e, para quem despacha, o aviso das entregas esperando motoboy. As contagens por área vêm de `GET /v1/admin/overview/pending` (W.7); área sem permissão vem nula e não aparece. */
export function AdminHome() {
  const { user, canView } = useSession();
  const { waiting } = useWaitingForCourier();
  const pending = usePendingCounts();
  const items = visibleNav(user.adminProfile).filter((item) => item.section !== 'inicio');
  const groups = (Object.keys(NAV_GROUP_LABEL) as NavGroupId[]).map((id) => ({ id, label: NAV_GROUP_LABEL[id], items: items.filter((item) => item.group === id) })).filter((g) => g.items.length > 0);
  const cards = pendingCards(pending, canView);
  const name = user.name.split(' ')[0] ?? user.name;
  return (
    <>
      <PageHeader title={`Olá, ${name}`} eyebrow={user.adminProfile ? PROFILE_LABEL[user.adminProfile] : 'Administração'} />
      {canView('logistica') && waiting.length > 0 ? (
        <NightBlock icon="scooter" title={`${waiting.length} ${waiting.length === 1 ? 'entrega esperando' : 'entregas esperando'} motoboy`} action={<LimaAction href="/admin/logistica" testId="admin.home.logistica">Abrir logística</LimaAction>} testId="admin.home.waiting">
          Mais antiga pelo <Lima>fim da faixa</Lima> no topo da fila.
        </NightBlock>
      ) : null}
      {cards.length > 0 ? (
        <section className={s.group} aria-labelledby="home-pending" data-testid="admin.home.pending">
          <h2 id="home-pending" className={cx('wb-text-title2', s.groupTitle)}>O que espera por você</h2>
          <ul className={s.kpis}>
            {cards.map((card) => (
              <li key={card.id}>
                <Link href={card.href as never} className={s.kpiLink} data-testid={`admin.home.pending-${card.id}`} aria-label={`${card.label}: ${card.value}. ${card.hint ?? ''} Abrir.`}>
                  <Kpi label={card.label} value={card.value} tone={card.tone} hint={card.hint} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groups.map((group) => (
        <section key={group.id} className={s.group} aria-labelledby={`home-${group.id}`}>
          <h2 id={`home-${group.id}`} className={cx('wb-text-title2', s.groupTitle)}>{group.label}</h2>
          <ul className={s.grid}>
            {group.items.map((item) => (
              <li key={item.section}>
                <Link href={item.href as never} className={s.card} data-testid={`admin.home.link-${item.section}`}>
                  <span className={s.icon}><SolarIcon name={ICONS[item.section] ?? 'info'} size={24} /></span>
                  <span className="wb-text-body-strong">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

type PendingCard = { id: string; label: string; value: number; href: string; tone: 'neutral' | 'warning'; hint?: string };

/** Só entram as áreas que a API devolveu (não nulas) e que o perfil enxerga no menu. */
function pendingCards(pending: PendingCounts | null, canView: (section: AdminSection) => boolean): PendingCard[] {
  if (!pending) return [];
  const cards: PendingCard[] = [];
  if (pending.alerts && canView('alertas')) {
    const critical = pending.alerts.critical;
    cards.push({ id: 'alertas', label: 'Alertas abertos', value: pending.alerts.open, href: '/admin/alertas', tone: critical > 0 ? 'warning' : 'neutral', ...(critical > 0 ? { hint: `${critical} ${critical === 1 ? 'crítico' : 'críticos'}: agir hoje` } : {}) });
  }
  if (pending.stores && canView('lojas')) cards.push({ id: 'lojas', label: 'Lojas em análise', value: pending.stores.inReview, href: '/admin/lojas', tone: 'neutral' });
  if (pending.disputes && canView('disputas')) cards.push({ id: 'disputas', label: 'Disputas em mediação', value: pending.disputes.inMediation, href: '/admin/disputas', tone: 'neutral' });
  if (pending.refunds && canView('estornos')) cards.push({ id: 'estornos', label: 'Estornos que pedem ação', value: pending.refunds.needingAction, href: '/admin/estornos', tone: pending.refunds.needingAction > 0 ? 'warning' : 'neutral' });
  if (pending.dataRequests && canView('titulares')) {
    const due = pending.dataRequests.dueSoon;
    cards.push({ id: 'titulares', label: 'Pedidos de titulares abertos', value: pending.dataRequests.open, href: '/admin/titulares', tone: due > 0 ? 'warning' : 'neutral', ...(due > 0 ? { hint: `${due} ${due === 1 ? 'vence' : 'vencem'} em até 5 dias` } : {}) });
  }
  return cards;
}
