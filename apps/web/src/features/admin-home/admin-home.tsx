'use client';

import Link from 'next/link';
import { Lima, NightBlock, LimaAction } from '@/components/panel/blocks';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { SolarIcon, cx, type SolarName } from '@/components/ui';
import { NAV_GROUP_LABEL, PROFILE_LABEL, visibleNav, type NavGroupId } from '@/lib/admin-access';
import { useWaitingForCourier } from '@/features/logistics/nav-count';
import s from './admin-home.module.css';

const ICONS: Record<string, SolarName> = {
  lojas: 'shield', logistica: 'scooter', estornos: 'wallet', frete: 'tag', comissoes: 'percent', trocas: 'exchange', moderacao: 'eye', regioes: 'map', categorias: 'layers',
  parametros: 'sliders', parametros_entrega: 'settings', flags: 'flag', termos: 'document', auditoria: 'clipboard', admins: 'team', banners: 'gallery', push: 'bell', cupons: 'ticket', relatorios: 'chart',
  denuncias: 'warning', ajuda: 'info', titulares: 'user', disputas: 'exchange',
};

/** Início do admin (RL2): atalhos para as áreas do perfil e, para quem despacha, o aviso das entregas esperando motoboy. A visão geral com números chega com o endpoint de contagens (docs/gestao/fila-backend-dev.md). */
export function AdminHome() {
  const { user, canView } = useSession();
  const { waiting } = useWaitingForCourier();
  const items = visibleNav(user.adminProfile).filter((item) => item.section !== 'inicio');
  const groups = (Object.keys(NAV_GROUP_LABEL) as NavGroupId[]).map((id) => ({ id, label: NAV_GROUP_LABEL[id], items: items.filter((item) => item.group === id) })).filter((g) => g.items.length > 0);
  const name = user.name.split(' ')[0] ?? user.name;
  return (
    <>
      <PageHeader title={`Olá, ${name}`} eyebrow={user.adminProfile ? PROFILE_LABEL[user.adminProfile] : 'Administração'} />
      {canView('logistica') && waiting.length > 0 ? (
        <NightBlock icon="scooter" title={`${waiting.length} ${waiting.length === 1 ? 'entrega esperando' : 'entregas esperando'} motoboy`} action={<LimaAction href="/admin/logistica" testId="admin.home.logistica">Abrir logística</LimaAction>} testId="admin.home.waiting">
          Mais antiga pelo <Lima>fim da faixa</Lima> no topo da fila.
        </NightBlock>
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
