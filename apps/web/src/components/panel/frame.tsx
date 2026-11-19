'use client';

import Link from 'next/link';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Dialog, Logo, SolarIcon, cx, type SolarName } from '@/components/ui';
import s from './frame.module.css';

/**
 * Moldura v3 dos painéis (`onda-7-paineis-v3.md` §1 e `onda-7-navegacao-paineis.md`): cabeçalho roxo com recorte diagonal que leva o
 * título da tela, barra lateral branca e folha branca (desktop >= 1024), barra inferior de 4 destinos + "Mais" (celular e tablet).
 * O lojista e o admin usam esta mesma moldura; cada um só informa suas áreas, grupos e prioridade da barra.
 */
export interface NavEntry {
  key: string;
  label: string;
  /** Rótulo curto na barra de baixo ("Lojas", "Disputas"); a folha usa o nome completo. */
  shortLabel?: string;
  href: string;
  icon: SolarName;
  /** Pendências (pedidos novos, corridas esperando). Aparece como número lima. */
  count?: number;
  countLabel?: (count: number) => string;
  countTestId?: string;
}

export interface NavGroup {
  label: string;
  items: NavEntry[];
}

export interface AccountEntry {
  key: string;
  label: string;
  hint?: string;
  icon: SolarName;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  testId: string;
}

export interface FrameTestIds {
  side: (key: string) => string;
  bottom: (key: string) => string;
  more: (key: string) => string;
  moreButton: string;
  moreSheet: string;
  moreSearch: string;
  account: (key: string) => string;
}

/** O título (eyebrow + h1) vive no cabeçalho roxo: `PageHeader` o leva até lá por portal. `null` = sem moldura (testes e telas soltas). */
const HeroSlot = createContext<{ element: HTMLElement | null } | null>(null);
export const useHeroSlot = () => useContext(HeroSlot);

function isActive(pathname: string, href: string, root: string): boolean {
  return href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`);
}

function Count({ entry }: { entry: NavEntry }) {
  if (!entry.count || entry.count <= 0) return null;
  return (
    <span className={s.count} aria-label={entry.countLabel?.(entry.count) ?? `${entry.count} pendentes`} data-testid={entry.countTestId}>
      {entry.count}
    </span>
  );
}

function SideNav({ groups, pathname, root, testIds, label }: { groups: NavGroup[]; pathname: string; root: string; testIds: FrameTestIds; label: string }) {
  return (
    <nav className={s.sideNav} aria-label={label}>
      {groups.map((group) => (
        <div key={group.label} className={s.sideGroup}>
          {groups.length > 1 ? <p className={cx('wb-text-micro', s.groupLabel)}>{group.label}</p> : null}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href, root);
            return (
              <Link key={item.key} href={item.href as never} className={cx(s.sideItem, 'wb-text-body-strong', active && s.sideItemActive)} aria-current={active ? 'page' : undefined} data-testid={testIds.side(item.key)}>
                <SolarIcon name={item.icon} size={24} />
                <span className={s.sideLabel}>{item.label}</span>
                <Count entry={item} />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function BottomNav({ items, pathname, root, testIds, moreActive, morePending, onMore, moreOpen }: { items: NavEntry[]; pathname: string; root: string; testIds: FrameTestIds; moreActive: boolean; morePending: number; onMore: () => void; moreOpen: boolean }) {
  return (
    <nav className={s.bottomNav} aria-label="Menu principal" data-chrome>
      {items.map((item) => {
        const active = isActive(pathname, item.href, root);
        return (
          <Link key={item.key} href={item.href as never} className={cx(s.bottomItem, active && s.bottomItemActive)} aria-current={active ? 'page' : undefined} aria-label={item.count ? `${item.label}, ${item.countLabel?.(item.count) ?? `${item.count} pendentes`}` : item.label} data-testid={testIds.bottom(item.key)}>
            <span className={s.bottomIcon}>
              <SolarIcon name={item.icon} size={24} />
              <Count entry={{ ...item, countLabel: () => '' }} />
            </span>
            <span className={cx('wb-text-micro', s.bottomLabel)}>{item.shortLabel ?? item.label}</span>
          </Link>
        );
      })}
      <button type="button" className={cx(s.bottomItem, moreActive && s.bottomItemActive)} aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={moreActive ? 'page' : undefined} aria-label={morePending > 0 ? `Mais, ${morePending} ${morePending === 1 ? 'pendente' : 'pendentes'}` : 'Mais'} onClick={onMore} data-testid={testIds.moreButton}>
        <span className={s.bottomIcon}>
          <SolarIcon name="more" size={24} />
          {morePending > 0 ? <span className={s.dot} aria-hidden="true" /> : null}
        </span>
        <span className={cx('wb-text-micro', s.bottomLabel)}>Mais</span>
      </button>
    </nav>
  );
}

function MoreSheet({ groups, account, pathname, root, testIds, onClose, onPick }: { groups: NavGroup[]; account: AccountEntry[]; pathname: string; root: string; testIds: FrameTestIds; onClose: () => void; onPick?: (kind: 'area' | 'account', key: string) => void }) {
  const [query, setQuery] = useState('');
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const needle = query.trim().toLowerCase();
  const visible = groups.map((g) => ({ ...g, items: needle ? g.items.filter((i) => i.label.toLowerCase().includes(needle)) : g.items })).filter((g) => g.items.length > 0);
  return (
    <Dialog sheet title="Mais" onClose={onClose} testId={testIds.moreSheet}>
      {total > 8 ? (
        <div className={s.moreSearch}>
          <SolarIcon name="search" size={20} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar área" aria-label="Buscar área" autoComplete="off" data-testid={testIds.moreSearch} />
        </div>
      ) : null}
      {needle && visible.length === 0 ? <p className={cx('wb-text-body', s.moreEmpty)}>Nenhuma área com esse nome.</p> : null}
      {visible.map((group) => (
        <div key={group.label} className={s.moreGroup}>
          {groups.length > 1 ? <p className={cx('wb-text-micro', s.groupLabel)}>{group.label}</p> : null}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href, root);
            return (
              <Link key={item.key} href={item.href as never} className={cx(s.moreRow, active && s.moreRowActive)} aria-current={active ? 'page' : undefined} onClick={() => { onPick?.('area', item.key); onClose(); }} data-testid={testIds.more(item.key)}>
                <span className={s.moreIcon}><SolarIcon name={item.icon} size={22} /></span>
                <span className={cx('wb-text-body-strong', s.moreName)}>{item.label}</span>
                <Count entry={item} />
                <SolarIcon name="caretRight" size={18} />
              </Link>
            );
          })}
        </div>
      ))}
      {!needle ? (
        <div className={s.moreGroup}>
          {groups.length > 0 ? <p className={cx('wb-text-micro', s.groupLabel)}>Conta</p> : null}
          {account.map((item) => {
            const body = (
              <>
                <span className={s.moreIcon}><SolarIcon name={item.icon} size={22} /></span>
                <span className={s.moreText}>
                  <span className={cx('wb-text-body-strong', s.moreName)}>{item.label}</span>
                  {item.hint ? <span className={cx('wb-text-caption', s.moreHint)}>{item.hint}</span> : null}
                </span>
                {item.danger ? null : <SolarIcon name="caretRight" size={18} />}
              </>
            );
            return item.href ? (
              <Link key={item.key} href={item.href as never} className={cx(s.moreRow, item.danger && s.moreRowDanger)} onClick={() => { onPick?.('account', item.key); onClose(); }} data-testid={item.testId}>{body}</Link>
            ) : (
              <button key={item.key} type="button" className={cx(s.moreRow, item.danger && s.moreRowDanger)} onClick={() => { onClose(); item.onSelect?.(); }} data-testid={item.testId}>{body}</button>
            );
          })}
        </div>
      ) : null}
    </Dialog>
  );
}

export interface PanelFrameProps {
  /** Raiz do painel (`/lojista` ou `/admin`): o item "Início" só fica ativo nela. */
  root: string;
  homeAriaLabel: string;
  /** Pastilha noite do cabeçalho (loja e estado, ou "Administração · perfil"). */
  pill: ReactNode;
  /** Ações do cabeçalho no desktop (Ajuda, Conta, Sair...). No celular vão para o "Mais". */
  actions: ReactNode;
  /** Só no celular, à direita do cabeçalho (ex.: som). */
  mobileActions?: ReactNode;
  groups: NavGroup[];
  /** Chaves dos destinos da barra de baixo, em ordem. Os que o perfil não enxerga são ignorados e a barra mostra os que existem. */
  bottomKeys: string[];
  account: AccountEntry[];
  testIds: FrameTestIds;
  /** Faixas globais (suspensa, sem conexão, som), no topo da folha. */
  banners?: ReactNode;
  /** Avisos fora da folha (alerta de pedido novo). */
  overlay?: ReactNode;
  idle?: ReactNode;
  /** Cadastro guiado (L3 a L7): sem navegação, só cabeçalho e folha (onda-7-paineis-v3 §5). */
  flow?: boolean;
  pathname: string;
  onMoreOpened?: () => void;
  onMorePicked?: (kind: 'area' | 'account', key: string) => void;
  children: ReactNode;
}

export function PanelFrame({ root, homeAriaLabel, pill, actions, mobileActions, groups, bottomKeys, account, testIds, banners, overlay, idle, flow, pathname, onMoreOpened, onMorePicked, children }: PanelFrameProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState(false);
  const hero = useMemo(() => ({ element: slot }), [slot]);

  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const bottom = bottomKeys.map((key) => all.find((i) => i.key === key)).filter((i): i is NavEntry => Boolean(i));
  const bottomSet = new Set(bottom.map((i) => i.key));
  const moreGroups = groups.map((g) => ({ ...g, items: g.items.filter((i) => !bottomSet.has(i.key)) })).filter((g) => g.items.length > 0);
  const moreItems = moreGroups.flatMap((g) => g.items);
  const moreActive = moreItems.some((i) => isActive(pathname, i.href, root)) || account.some((a) => a.href && pathname.startsWith(a.href));
  const morePending = moreItems.reduce((n, i) => n + (i.count ?? 0), 0);

  return (
    <HeroSlot.Provider value={hero}>
      <div className={cx(s.shell, flow && s.flow)}>
        <a href="#conteudo" className={cx(s.skip, 'wb-text-label')}>Pular para o conteúdo</a>
        <header className={s.hero} data-chrome>
          <div className={s.topbar}>
            <Link href={root as never} className={s.brand} aria-label={homeAriaLabel}>
              <span className={s.logoFull}><Logo size={38} tone="white" /></span>
              <span className={s.logoSym}><Logo size={32} tone="white" compact /></span>
            </Link>
            <div className={s.pillWrap}>{pill}</div>
            <span className={s.spacer} />
            <div className={s.mobileActions}>{mobileActions}</div>
            <div className={s.actions}>{actions}</div>
          </div>
          <div className={s.titleSlot} ref={setSlot} data-testid="panel.title-slot" />
        </header>
        {overlay}
        <div className={s.layout}>
          <aside className={s.side} data-chrome>
            <SideNav groups={groups} pathname={pathname} root={root} testIds={testIds} label="Menu do painel" />
          </aside>
          <main id="conteudo" className={s.sheet} tabIndex={-1}>
            {banners ? <div className={s.banners} data-chrome>{banners}</div> : null}
            <div className={s.content}>{children}</div>
          </main>
        </div>
        <div className={s.bottomBar} data-chrome>
          <div className={s.bottomInner}>
            <BottomNav items={bottom} pathname={pathname} root={root} testIds={testIds} moreActive={moreActive} morePending={morePending} moreOpen={more} onMore={() => { setMore(true); onMoreOpened?.(); }} />
          </div>
        </div>
        {more ? <MoreSheet groups={moreGroups} account={account} pathname={pathname} root={root} testIds={testIds} onClose={() => setMore(false)} onPick={onMorePicked} /> : null}
        {idle}
      </div>
    </HeroSlot.Provider>
  );
}
