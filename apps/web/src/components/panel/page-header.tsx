'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx, ui } from '@/components/ui';
import { useHeroSlot } from './frame';
import s from './frame.module.css';

/**
 * Cabeçalho da tela (v3). Dentro da moldura dos painéis o título (`h1`, Bricolage 800) e a pastilha `eyebrow` vão para o cabeçalho
 * roxo, por portal; o subtítulo e a ação principal ficam na primeira linha da folha (ação nunca no roxo, onda-7-paineis-v3 §0).
 * Sem moldura (testes, telas soltas) tudo fica no lugar, como antes. Foco no h1 ao abrir a tela (onda-2 §0.3).
 */
export function PageHeader({ title, description, action, eyebrow }: { title: string; description?: string; action?: ReactNode; eyebrow?: string }) {
  const hero = useHeroSlot();
  const ref = useRef<HTMLHeadingElement>(null);
  const element = hero?.element ?? null;
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [element]);

  const heading = (
    <h1 ref={ref} tabIndex={-1} className={hero ? s.heroTitle : cx('wb-text-title1', ui.noOutline)} data-testid={hero ? 'panel.title' : undefined}>
      {title}
    </h1>
  );

  if (hero) {
    return (
      <>
        {element
          ? createPortal(
              <>
                {eyebrow ? <span className={s.eyebrow}>{eyebrow}</span> : null}
                {heading}
              </>,
              element,
            )
          : null}
        {description || action ? (
          <div className={ui.pageHeader}>
            {description ? <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>{description}</p> : <span />}
            {action}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <div className={ui.pageHeader}>
      <div>
        {heading}
        {description ? <p className={cx('wb-text-body', ui.muted)} style={{ margin: '4px 0 0' }}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
