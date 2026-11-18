'use client';

import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { ui } from '@/components/ui';
import s from './panel.module.css';

/**
 * Lista + painel de edição. Desktop (≥ 1024): lista à esquerda e painel fixo de 400 à direita.
 * Celular e tablet: o painel abre em tela cheia sobre a lista (onda-1b §AD2 e §AD3).
 */
export function SplitLayout({ list, panel, panelOpen, onClosePanel, panelTitle }: { list: ReactNode; panel: ReactNode; panelOpen: boolean; onClosePanel: () => void; panelTitle: string }) {
  return (
    <div className={s.split}>
      <div>{list}</div>
      <aside className={panelOpen ? s.panelOverlay : s.panelHidden} aria-label={panelTitle}>
        {panelOpen ? (
          <div className={s.panel}>
            <div className={ui.row} style={{ justifyContent: 'space-between' }}>
              <h2 className="wb-text-title2" style={{ margin: 0 }}>{panelTitle}</h2>
              <button type="button" className={ui.iconButton} aria-label="Fechar painel" onClick={onClosePanel}>
                <X size={24} aria-hidden="true" />
              </button>
            </div>
            {panel}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
