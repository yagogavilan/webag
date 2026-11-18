import type { ReactNode } from 'react';
import type { PanelArea } from '@/lib/areas';
import styles from './area-shell.module.css';

/** Moldura de uma área do painel. Navegação e guarda de acesso entram com as histórias de cada área. */
export function AreaShell({ area, children }: { area: PanelArea; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={`wb-text-title2 ${styles.brand}`}>webag</span>
        <span className={`wb-text-label ${styles.area}`}>{area.title}</span>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
