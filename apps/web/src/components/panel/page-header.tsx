'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cx, ui } from '@/components/ui';

/** Foco no h1 ao abrir a tela (onda-2 §0.3). `action` é a ação principal da tela. */
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={ui.pageHeader}>
      <div>
        <h1 ref={ref} tabIndex={-1} className="wb-text-title1" style={{ margin: 0, outline: 'none' }}>
          {title}
        </h1>
        {description ? <p className={cx('wb-text-body', ui.muted)} style={{ margin: '4px 0 0' }}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
