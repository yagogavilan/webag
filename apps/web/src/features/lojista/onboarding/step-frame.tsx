'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Banner, Button, cx, ui } from '@/components/ui';
import { formatClock } from '@/lib/format';
import { ltid } from '@/lib/testid';
import s from '../lojista.module.css';

interface Props {
  /** 1 a 4; a revisão não tem número. */
  step?: 1 | 2 | 3 | 4;
  /** Texto no lugar de "Etapa X de 4" (revisão e correção). */
  label?: string;
  screen: string;
  title: string;
  /** Último salvamento ("Salvo às 14:32"). */
  savedAt?: string | null;
  backHref?: string | undefined;
  submitLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onSubmit: (event: FormEvent) => void;
  /** Erro de envio acima do botão (onda-2 EP: "Erro ao salvar"). */
  error?: ReactNode;
  children: ReactNode;
  /** Ação secundária de texto ao lado do botão principal. */
  extraAction?: ReactNode;
}

/** Moldura das etapas (L3 a L7): "Etapa X de 4" + barra de progresso, título com foco, rodapé com Voltar e o botão principal. */
export function StepFrame({ step, label, screen, title, savedAt, backHref, submitLabel, busyLabel = 'Salvando…', busy, onSubmit, error, children, extraAction }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  const percent = step ? step * 25 : 100;
  return (
    <form onSubmit={onSubmit} className={ui.stack} noValidate data-testid={ltid(screen, 'form')}>
      <div className={s.stepHeader}>
        <div className={s.stepMeta}>
          <span className="wb-text-label" data-testid={ltid(screen, 'step-label')}>
            {step ? `Etapa ${step} de 4` : (label ?? 'Última conferência')}
          </span>
          {savedAt ? (
            <span className={cx('wb-text-caption', s.saved)} role="status" data-testid={ltid(screen, 'saved')}>
              Salvo às {formatClock(savedAt)}
            </span>
          ) : null}
        </div>
        <div className={s.progress} role="progressbar" aria-label="Progresso do cadastro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className={s.progressBar} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <h1 ref={heading} tabIndex={-1} className={`wb-text-title1 ${s.title}`}>
        {title}
      </h1>
      {children}
      {error ? <div>{error}</div> : null}
      <div className={cx(s.sticky, s.stepActions)}>
        {backHref ? (
          <Link href={backHref as never} className={cx('wb-text-body-strong', ui.row)} style={{ minHeight: 'var(--wb-size-touch-min)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} data-testid={ltid(screen, 'back')}>
            Voltar
          </Link>
        ) : (
          <span />
        )}
        <span style={{ display: 'flex', gap: 'var(--wb-space-2)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {extraAction}
          <Button type="submit" size="lg" loading={busy} loadingLabel={busyLabel} data-testid={ltid(screen, 'submit')}>
            {submitLabel}
          </Button>
        </span>
      </div>
    </form>
  );
}

export function SaveError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Banner tone="danger" testId="lojista.onboarding.save-error" action={onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Tentar de novo</Button> : undefined}>
      {message}
    </Banner>
  );
}
