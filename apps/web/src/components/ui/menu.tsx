'use client';

import { DotsThree } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';
import s from './ui.module.css';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  testId?: string;
}

/** Menu de ações por linha (DotsThree). Setas navegam, Esc fecha e devolve o foco. */
export function ActionMenu({ label, actions, testId }: { label: string; actions: MenuAction[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function move(event: React.KeyboardEvent, delta: number) {
    event.preventDefault();
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + delta + items.length) % items.length]?.focus();
  }

  return (
    <span className={s.menuWrap} ref={wrap}>
      <button ref={trigger} type="button" className={s.iconButton} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((v) => !v)} data-testid={testId}>
        <DotsThree size={24} weight="bold" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={s.menu}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              trigger.current?.focus();
            }
            if (event.key === 'ArrowDown') move(event, 1);
            if (event.key === 'ArrowUp') move(event, -1);
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={cx(s.menuItem, 'wb-text-body', action.danger && s.menuItemDanger)}
              data-testid={action.testId}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

export function Tabs<T extends string>({ label, value, onChange, tabs }: { label: string; value: T; onChange: (value: T) => void; tabs: { id: T; label: string; testId?: string }[] }) {
  return (
    <div role="tablist" aria-label={label} className={s.tabs}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          type="button"
          className={cx(s.tab, 'wb-text-body-strong')}
          aria-selected={value === tab.id}
          aria-controls={`panel-${tab.id}`}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            const index = tabs.findIndex((t) => t.id === tab.id);
            const next = event.key === 'ArrowRight' ? tabs[index + 1] : event.key === 'ArrowLeft' ? tabs[index - 1] : undefined;
            if (next) {
              onChange(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }
          }}
          data-testid={tab.testId}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}
