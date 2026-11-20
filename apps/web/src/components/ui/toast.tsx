'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import s from './ui.module.css';
import { cx } from './cx';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastOptions {
  /** Ação no próprio aviso (ex.: "Desfazer"). Com ela o aviso fica 8 s, para dar tempo de tocar. */
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const PLAIN_MS = 4000;
const ACTION_MS = 8000;

interface Current {
  message: string;
  action?: ToastAction | undefined;
}

/** Um toast por vez, 4 s (8 s com ação), em região viva educada (design-system.md §3.1). Erro que exige decisão NÃO é toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Current | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, options?: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent({ message: text, action: options?.action });
    timer.current = setTimeout(() => setCurrent(null), options?.action ? ACTION_MS : PLAIN_MS);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={s.toasts} role="status" aria-live="polite" aria-atomic="true">
        {current ? (
          <div className={cx(s.toast, 'wb-text-body')} data-testid="toast">
            <span>{current.message}</span>
            {current.action ? (
              <button
                type="button"
                className={cx(s.toastAction, 'wb-text-body-strong')}
                onClick={() => {
                  if (timer.current) clearTimeout(timer.current);
                  setCurrent(null);
                  current.action?.onAction();
                }}
                data-testid="toast-action"
              >
                {current.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
