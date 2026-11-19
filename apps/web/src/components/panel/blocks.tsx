import Link from 'next/link';
import type { ReactNode } from 'react';
import { SolarIcon, cx, type SolarName } from '@/components/ui';
import s from './blocks.module.css';

/**
 * Blocos v3 dos painéis (`onda-7-paineis-v3.md` §1): número grande (`Kpi`), bloco noite para o que pede ação agora (`NightBlock`) e
 * bloco de prazo restante (`DeadlineBlock`). Tom nunca é só cor: o rótulo e o texto dizem o estado. Só tokens.
 */
export type KpiTone = 'neutral' | 'night' | 'warning' | 'danger';

export function Kpi({ label, value, tone = 'neutral', hint, testId }: { label: string; value: ReactNode; tone?: KpiTone; hint?: ReactNode; testId?: string }) {
  return (
    <div className={cx(s.kpi, s[`kpi_${tone}`])} data-testid={testId}>
      <span className={cx('wb-text-label', s.kpiLabel)}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
      {hint ? <span className={cx('wb-text-caption', s.kpiHint)}>{hint}</span> : null}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className={s.kpiRow}>{children}</div>;
}

/** Botão lima, só sobre noite (acento ≤ 5%: "Aceitar pedido", "Ver em andamento", "Atribuir ao mesmo motoboy"). */
export function LimaAction({ href, children, testId, onClick, disabled }: { href?: string; children: ReactNode; testId?: string; onClick?: () => void; disabled?: boolean }) {
  if (href) {
    return (
      <Link href={href as never} className={s.lima} data-testid={testId}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={s.lima} onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </button>
  );
}

/** Bloco noite: ícone em quadrado lima, texto e ação. Um por tela (nunca dois lado a lado). */
export function NightBlock({ icon, title, children, action, testId, role }: { icon: SolarName; title: ReactNode; children?: ReactNode; action?: ReactNode; testId?: string; role?: 'status' | 'alert' }) {
  return (
    <section className={s.night} data-testid={testId} role={role}>
      <span className={s.nightIcon}>
        <SolarIcon name={icon} size={30} duotone />
      </span>
      <div className={s.nightBody}>
        <p className={cx('wb-text-title2', s.nightTitle)}>{title}</p>
        {children ? <p className={cx('wb-text-body', s.nightText)}>{children}</p> : null}
      </div>
      {action ? <div className={s.nightAction}>{action}</div> : null}
    </section>
  );
}

/** Trecho em destaque dentro do bloco noite (contagem regressiva, valor): lima sobre noite. */
export function Lima({ children }: { children: ReactNode }) {
  return <strong className={s.limaText}>{children}</strong>;
}

export type DeadlineState = 'ontime' | 'risk' | 'late' | 'none';

/** Prazo restante: "No prazo / 22 min", "Em risco / 12 min", "Atrasada / +8 min" (bloco `danger`, texto branco). */
export function DeadlineBlock({ state, label, value, sub, testId }: { state: DeadlineState; label: string; value: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className={cx(s.deadline, s[`deadline_${state}`])} data-testid={testId} data-state={state}>
      <span className={cx('wb-text-micro', s.deadlineLabel)}>
        {state === 'late' ? <SolarIcon name="alert" size={16} /> : null}
        {label}
      </span>
      <span className={s.deadlineValue}>{value}</span>
      {sub ? <span className={cx('wb-text-caption-strong', s.deadlineSub)}>{sub}</span> : null}
    </div>
  );
}
