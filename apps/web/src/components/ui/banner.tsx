'use client';

import { CheckCircle, Info, Warning, WarningCircle, WifiSlash } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './ui.module.css';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const ICONS = { info: Info, success: CheckCircle, warning: Warning, danger: WarningCircle };

/** Aviso inline: ícone + texto (+ ação). Erro usa `role="alert"`; os demais, região educada. */
export function Banner({ tone = 'info', children, action, testId, offline }: { tone?: Tone; children: ReactNode; action?: ReactNode; testId?: string; offline?: boolean }) {
  const Icon = offline ? WifiSlash : ICONS[tone];
  return (
    <div className={cx(s.banner, s[tone])} role={tone === 'danger' ? 'alert' : 'status'} data-testid={testId}>
      <Icon size={24} weight="fill" aria-hidden="true" />
      <div className={s.bannerBody}>
        <div className={cx('wb-text-body', s.bannerText)}>{children}</div>
        {action}
      </div>
    </div>
  );
}

export function Badge({ tone, icon, children, testId }: { tone?: Tone | 'brand' | 'neutral'; icon?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <span className={cx(s.badge, 'wb-text-micro', tone && tone !== 'neutral' && s[tone])} data-testid={testId}>
      {icon}
      {children}
    </span>
  );
}
