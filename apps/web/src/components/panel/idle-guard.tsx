'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, ui } from '@/components/ui';

/** Sessão do admin: 30 min sem uso (WB-100 C3); aviso aos 28 min (AC5b). */
export const IDLE_LIMIT_MS = 30 * 60_000;
export const IDLE_WARNING_MS = 28 * 60_000;

function format(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** O texto de "Faltam..." é lido ao abrir e atualizado só em 1:00 e 0:30 (design-system.md §7, temporizadores). */
export function announced(remainingMs: number): string {
  const s = Math.ceil(remainingMs / 1000);
  if (s > 60) return '2 minutos';
  if (s > 30) return '1 minuto';
  return '30 segundos';
}

export function IdleGuard({ onTimeout, limitMs = IDLE_LIMIT_MS, warningMs = IDLE_WARNING_MS }: { onTimeout: () => void; limitMs?: number; warningMs?: number }) {
  const lastActivity = useRef<number | null>(null);
  const warningOpen = useRef(false);
  const timedOut = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    lastActivity.current = Date.now();
    const touch = () => {
      if (!warningOpen.current) lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    const timer = setInterval(() => {
      const idle = Date.now() - (lastActivity.current ?? Date.now());
      if (idle >= limitMs) {
        if (!timedOut.current) {
          timedOut.current = true;
          warningOpen.current = false;
          setRemaining(null);
          onTimeoutRef.current();
        }
      } else if (idle >= warningMs) {
        warningOpen.current = true;
        setRemaining(limitMs - idle);
      }
    }, 1000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, touch));
      clearInterval(timer);
    };
  }, [limitMs, warningMs]);

  if (remaining === null) return null;
  return (
    <Dialog
      alert
      locked
      title="Sua sessão vai terminar"
      testId="admin.session.timeout-dialog"
      onClose={() => undefined}
      actions={
        <>
          <Button
            data-testid="admin.session.keep"
            onClick={() => {
              lastActivity.current = Date.now();
              warningOpen.current = false;
              setRemaining(null);
            }}
          >
            Continuar conectado
          </Button>
          <Button variant="text" data-testid="admin.session.logout" onClick={() => onTimeoutRef.current()}>
            Sair agora
          </Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>
        Por segurança, saímos depois de 30 minutos sem uso. Faltam <span aria-hidden="true">{format(remaining)}</span>
        <span className={ui.srOnly} aria-live="polite">
          {announced(remaining)}
        </span>
        .
      </p>
    </Dialog>
  );
}
