'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import s from './ui.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  children: ReactNode;
  /** Botões. O primário vem primeiro no código (no celular empilha; no desktop vai à direita). */
  actions?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  alert?: boolean;
  testId?: string;
  /** Impede fechar por Esc e clique fora (ex.: envio em andamento). */
  locked?: boolean;
  describedBy?: string;
  /** Celular: ocupa a tela inteira (alerta de pedido novo). */
  fullOnMobile?: boolean;
  /** Folha inferior (v3: "Mais" da barra de navegação): sobe da base, raio 30 em cima. */
  sheet?: boolean;
}

/**
 * Dialog acessível: foco preso, vai ao título ao abrir e volta ao gatilho ao fechar, Esc fecha,
 * fundo inerte para o leitor de tela. `alert` usa `role="alertdialog"` (aviso de inatividade).
 */
export function Dialog({ title, children, actions, onClose, wide, alert, testId, locked, describedBy, fullOnMobile, sheet }: Props) {
  const titleId = useId();
  const bodyId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    const siblings = Array.from(document.body.children).filter((el) => el.tagName !== 'SCRIPT' && !el.hasAttribute('data-dialog-root'));
    siblings.forEach((el) => el.setAttribute('inert', ''));
    return () => {
      siblings.forEach((el) => el.removeAttribute('inert'));
      trigger?.focus?.();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !locked) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === heading.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div data-dialog-root className={cx(s.backdrop, fullOnMobile && s.backdropFull, sheet && s.backdropSheet)} onMouseDown={(event) => event.target === event.currentTarget && !locked && onClose()} onKeyDown={onKeyDown}>
      <div ref={panel} role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy ?? bodyId} className={cx(s.dialog, wide && s.dialogWide, fullOnMobile && s.dialogFull, sheet && s.dialogSheet)} data-testid={testId}>
        <h2 ref={heading} id={titleId} tabIndex={-1} className={cx('wb-text-title2', s.dialogTitle)}>
          {title}
        </h2>
        <div id={bodyId} className={s.stack}>
          {children}
        </div>
        {actions ? <div className={s.dialogActions}>{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
