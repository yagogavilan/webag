'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx';
import s from './ui.module.css';

type Variant = 'primary' | 'secondary' | 'text' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Mostra spinner, troca o rótulo por `loadingLabel` e ignora cliques (evita envio duplo). */
  loading?: boolean;
  loadingLabel?: string;
}

export function Spinner() {
  return <span className={s.spinner} aria-hidden="true" />;
}

function classes({ variant = 'primary', size = 'md' }: CommonProps, extra?: string) {
  return cx(s.button, s[variant], size !== 'md' && s[size], extra);
}

export function Button({ variant, size, icon, loading, loadingLabel, children, className, disabled, type = 'button', onClick, ...rest }: CommonProps & ComponentProps<'button'>) {
  return (
    <button
      {...rest}
      type={type}
      className={classes({ variant, size }, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
    >
      {loading ? <Spinner /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

export function ButtonLink({ variant, size, icon, children, className, ...rest }: Omit<CommonProps, 'loading' | 'loadingLabel'> & ComponentProps<typeof Link>) {
  return (
    <Link {...rest} className={classes({ variant, size }, className)}>
      {icon}
      {children}
    </Link>
  );
}
