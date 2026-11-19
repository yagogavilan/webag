import type { ReactNode } from 'react';
import { cx } from './cx';
import { SpeedLines } from './logo';
import s from './hero.module.css';

/**
 * Faixa de destaque (início do painel, direção visual v2): fundo da marca com linhas de velocidade à esquerda.
 * Texto pequeno só dentro de pílula branca (branco sobre #C02EF0 = 4,29:1, só vale para texto grande).
 */
export function Hero({ title, chip, actions, children, testId }: { title: string; chip?: ReactNode; actions?: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <section className={s.hero} data-testid={testId} aria-label={title}>
      <SpeedLines className={s.lines} />
      <div className={s.body}>
        {chip ? <span className={cx('wb-text-caption-strong', s.chip)}>{chip}</span> : null}
        <h1 className={cx('wb-text-hero', s.title)}>{title}</h1>
        {children}
      </div>
      {actions ? <div className={s.actions}>{actions}</div> : null}
    </section>
  );
}
