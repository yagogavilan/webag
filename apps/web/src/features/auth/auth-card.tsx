'use client';

import { Lock } from '@phosphor-icons/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Badge, Logo, cx, ui } from '@/components/ui';
import s from './auth.module.css';

/** Moldura das telas de acesso do admin: logo e selo fixo "Painel administrativo" (anti página falsa, §0.6). */
export function AuthCard({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <div className={s.page}>
      <Logo size={40} />
      <div className={cx(ui.card, s.card)} style={wide ? { maxWidth: 480 } : undefined}>
        <span className={s.seal}>
          <Badge tone="brand" icon={<Lock size={16} weight="fill" aria-hidden="true" />}>
            Painel administrativo
          </Badge>
        </span>
        <h1 ref={heading} tabIndex={-1} className={cx('wb-text-title1', s.title)}>
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

export function LinkButton({ children, onClick, testId }: { children: ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button type="button" className={cx('wb-text-body', s.link)} onClick={onClick} data-testid={testId}>
      {children}
    </button>
  );
}
