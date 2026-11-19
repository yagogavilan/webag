'use client';

import { ArrowLeft, Info, Warning, WarningCircle } from '@phosphor-icons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, cx } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { asRoute } from '@/lib/routes';
import { useOnline } from '@/lib/use-online';
import type { AdminAlertSeverity } from '@/lib/api/admin-ops';
import s from './ops.module.css';

/** Sem conexão: aparelho offline ou falha de rede da última chamada (o `ErrorState` troca o texto e o ícone). */
export function useIsOffline(error: unknown): boolean {
  const online = useOnline();
  return !online || (error instanceof ApiError && error.isNetwork);
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={asRoute(href)} className={cx('wb-text-body-strong', s.back)}>
      <ArrowLeft size={20} aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Gravidade em texto + ícone (nunca só cor). */
export function SeverityBadge({ severity }: { severity: AdminAlertSeverity }) {
  if (severity === 'critical') return <Badge tone="danger" icon={<WarningCircle size={16} weight="fill" aria-hidden="true" />}>Crítico</Badge>;
  if (severity === 'warning') return <Badge tone="warning" icon={<Warning size={16} weight="fill" aria-hidden="true" />}>Atenção</Badge>;
  return <Badge tone="info" icon={<Info size={16} weight="fill" aria-hidden="true" />}>Acompanhar</Badge>;
}

/** Texto para a chave de uma lista de dados do alerta ("amountCents" fica como o sistema gravou: é dado técnico). */
export function techValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** "há 3 h" / "há 2 dias" para o alerta mais antigo (arredondado para baixo). */
export function ageText(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} dias`;
}
