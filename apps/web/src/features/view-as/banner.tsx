'use client';

import { Clock, Eye } from '@phosphor-icons/react';
import { cx, ui } from '@/components/ui';
import { tid } from '@/lib/testid';
import { clockLabel, clockText, phaseOf } from './clock';
import { useRemaining, useWarnings } from './use-view-as';
import s from './view-as.module.css';

export const T = (id: string) => tid('ver-como', id);

/**
 * Banner permanente (WB-352 C1): "Visualizando como [loja] (somente leitura)", tempo restante e "Sair da visualização". Região rotulada
 * (NÃO `role=status`, que leria o relógio a toda hora); o relógio é `role=timer` e os avisos de 5 min e 1 min vão numa região `aria-live` à parte.
 * Existe em todos os estados da visão (carregando, vazio, erro, sem rede): o tempo corre durante eles.
 */
export function ViewAsBanner({ storeName, expiresAt, exiting, onExit }: { storeName: string; expiresAt: string; exiting: boolean; onExit: () => void }) {
  const remaining = useRemaining(expiresAt);
  const phase = phaseOf(remaining);
  const warning = useWarnings(remaining, true);
  return (
    <>
      <div className={s.banner} role="region" aria-label="Visualização do admin" data-testid={T('banner')}>
        <p className={cx('wb-text-body-strong', s.bannerTitle)}>
          <Eye size={20} weight="fill" aria-hidden="true" />
          <span>Visualizando como {storeName} (somente leitura)</span>
        </p>
        <span className={cx('wb-text-caption-strong', s.timer, phase !== 'normal' && s.timerAttention)} role="timer" aria-label={clockLabel(remaining)} data-testid={T('timer')}>
          <Clock size={16} aria-hidden="true" />
          {clockText(remaining)}
        </span>
        <button type="button" className={cx('wb-text-label', s.exit)} onClick={onExit} disabled={exiting} data-testid={T('exit')}>
          {exiting ? 'Saindo…' : 'Sair da visualização'}
        </button>
      </div>
      <div aria-live="polite" role="status" className={ui.srOnly} data-testid={T('live')}>
        {warning}
      </div>
    </>
  );
}
