'use client';

import { Lock, WarningCircle, WifiSlash } from '@phosphor-icons/react';
import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { Button } from './button';
import { cx } from './cx';
import s from './ui.module.css';

type IconType = ComponentType<{ size?: number; weight?: 'duotone' | 'regular' | 'fill'; 'aria-hidden'?: boolean | 'true' }>;

export function MessageState({ icon: Icon, title, text, children, testId, role, focusTitle }: { icon: IconType; title: string; text?: string; children?: ReactNode; testId?: string; role?: 'alert'; focusTitle?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) ref.current?.focus();
  }, [focusTitle]);
  return (
    <div className={s.state} data-testid={testId} role={role}>
      <span className={s.stateIcon} aria-hidden="true">
        {/* sacola da marca, sem rosto (v3); o ícone do contexto vai no selo noite */}
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca */}
        <img className={s.stateBagImg} src="/brand/webag-simbolo.svg" width={64} height={42} alt="" />
        <span className={s.stateBadge}>
          <Icon size={22} weight="duotone" aria-hidden="true" />
        </span>
      </span>
      <h2 ref={ref} tabIndex={-1} className={cx('wb-text-title2', s.stateTitle)} style={{ outline: 'none' }}>
        {title}
      </h2>
      {text ? <p className={cx('wb-text-body', s.stateText)}>{text}</p> : null}
      {children}
    </div>
  );
}

/** Vazio sempre com próximo passo (design-system.md §5.2). */
export function EmptyState({ icon, title, text, actionLabel, onAction, testId }: { icon: IconType; title: string; text: string; actionLabel?: string; onAction?: () => void; testId?: string }) {
  return (
    <MessageState icon={icon} title={title} text={text} testId={testId}>
      {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </MessageState>
  );
}

/** Erro: o que houve + o que fazer (§5.3). `slow` é a rede lenta depois de 8 s. */
export function ErrorState({ onRetry, slow, offline, testId }: { onRetry?: () => void; slow?: boolean; offline?: boolean; testId?: string }) {
  const title = offline ? 'Sem conexão' : slow ? 'Está demorando' : 'Não conseguimos carregar agora';
  const text = offline ? 'Conecte-se para continuar. O que já carregou continua aqui.' : slow ? 'Sua conexão parece lenta.' : 'Seus dados estão salvos. Tente de novo em instantes.';
  return (
    <MessageState icon={offline ? WifiSlash : WarningCircle} title={title} text={text} testId={testId ?? 'error-state'} role="alert">
      {onRetry ? <Button onClick={onRetry}>Tentar de novo</Button> : null}
    </MessageState>
  );
}

/** Sem permissão (admin): texto fixo do design system. */
export function NoAccessState({ backHref = '/admin', onBack }: { backHref?: string; onBack?: () => void }) {
  return (
    <MessageState icon={Lock} title="Você não tem acesso a essa área" text="Peça ao administrador para liberar seu perfil." testId="no-access" focusTitle>
      <Button onClick={onBack ?? (() => window.location.assign(backHref))}>Voltar ao painel</Button>
    </MessageState>
  );
}

export function Skeleton({ height = 20, width = '100%', label }: { height?: number; width?: string | number; label?: string }) {
  return <span className={s.skeleton} style={{ height, width }} aria-hidden={label ? undefined : 'true'} aria-label={label} />;
}

/** Linhas de skeleton com a forma do conteúdo; o contêiner anuncia "Carregando ..." ao leitor de tela. */
export function SkeletonRows({ rows = 4, height = 72, label = 'Carregando' }: { rows?: number; height?: number; label?: string }) {
  return (
    <div className={s.skeletonList} role="status" aria-label={label} data-testid="skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}
