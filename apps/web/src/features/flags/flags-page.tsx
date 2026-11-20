'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Banner, NoAccessState, QueryBoundary, Switch, cx, ui, useToast } from '@/components/ui';
import s from '@/components/panel/panel.module.css';
import { adminApi, keys, type FeatureFlag } from '@/lib/api/admin';
import { formatDateTime } from '@/lib/format';
import { tid } from '@/lib/testid';
import { copyOf, leavesNoPayment } from './catalog';

const T = (id: string) => tid('flags', id);
const PROPAGATION_MS = 60_000;

export function FlagsPage() {
  const { canView, canEdit } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: keys.flags, queryFn: adminApi.flags });
  const [asking, setAsking] = useState<FeatureFlag | null>(null);
  const [recent, setRecent] = useState<Record<string, true>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const set = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => adminApi.setFlag(key, enabled),
  });

  if (!canView('flags')) return <NoAccessState />;
  const editable = canEdit('flags');

  async function confirm(flag: FeatureFlag) {
    const enabled = !flag.enabled;
    const name = copyOf(flag);
    setRowError((prev) => ({ ...prev, [flag.key]: '' }));
    try {
      await set.mutateAsync({ key: flag.key, enabled });
    } catch (error) {
      setRowError((prev) => ({ ...prev, [flag.key]: `Não foi possível alterar. A flag continua ${flag.enabled ? 'ligada' : 'desligada'}.` }));
      throw error;
    }
    await client.invalidateQueries({ queryKey: keys.flags });
    toast.show(`${enabled ? 'Ligada' : 'Desligada'}: ${name.name}. Registrado na auditoria.`);
    setRecent((prev) => ({ ...prev, [flag.key]: true }));
    timers.current.push(
      window.setTimeout(() => {
        setRecent((prev) => {
          const next = { ...prev };
          delete next[flag.key];
          return next;
        });
      }, PROPAGATION_MS),
    );
  }

  return (
    <>
      <PageHeader title="Feature flags" description="Ligue ou desligue uma função sem publicar uma versão. Toda mudança fica na auditoria." />
      <QueryBoundary query={query} skeletonLabel="Carregando flags" skeleton={<div data-testid="skeleton" role="status" aria-label="Carregando flags" className={ui.skeletonList}>{Array.from({ length: 6 }, (_, i) => <span key={i} className={ui.skeleton} style={{ height: 72 }} aria-hidden="true" />)}</div>}>
        {(page) => (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 880 }}>
            {page.data.map((flag) => {
              const copy = copyOf(flag);
              return (
                <li key={flag.key} className={s.listItem} data-testid={T(`flag-${flag.key}`)}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="wb-text-body-strong">{copy.name}</span>
                    <span className={cx('wb-text-caption', ui.muted)}>{copy.effect}</span>
                    <span className={cx('wb-text-caption', ui.muted)} data-testid={T(`flag-${flag.key}-meta`)}>
                      {recent[flag.key] ? 'Chega ao app em até 1 minuto.' : flag.updatedAt ? `Alterada em ${formatDateTime(flag.updatedAt)}` : 'Valor padrão'}
                    </span>
                    {rowError[flag.key] ? <span className="wb-text-caption-strong" role="alert" style={{ color: 'var(--wb-color-text-danger)' }}>{rowError[flag.key]}</span> : null}
                  </div>
                  <Switch checked={flag.enabled} onChange={() => setAsking(flag)} label={copy.name} onText="Ligada" offText="Desligada" disabled={!editable} testId={T(`flag-${flag.key}-switch`)} />
                </li>
              );
            })}
          </ul>
        )}
      </QueryBoundary>
      {asking ? <FlagDialog flag={asking} flags={query.data?.data ?? []} onConfirm={() => confirm(asking)} onClose={() => setAsking(null)} /> : null}
    </>
  );
}

function FlagDialog({ flag, flags, onConfirm, onClose }: { flag: FeatureFlag; flags: FeatureFlag[]; onConfirm: () => Promise<unknown>; onClose: () => void }) {
  const copy = copyOf(flag);
  const turningOff = flag.enabled;
  const noPayment = turningOff && leavesNoPayment(flags, flag.key);
  return (
    <ReasonDialog
      title={`${turningOff ? 'Desligar' : 'Ligar'} ${copy.name.charAt(0).toLowerCase()}${copy.name.slice(1)}?`}
      description={turningOff ? `${copy.effect} Vale em até 1 minuto. Pedidos já criados seguem normalmente.` : 'Passa a valer no app em até 1 minuto.'}
      /* A API ainda não recebe `reason` em PUT /admin/feature-flags (pendência registrada); a auditoria guarda antes e depois. */
      withReason={false}
      confirmLabel={noPayment ? 'Desligar mesmo assim' : `${turningOff ? 'Desligar' : 'Ligar'} ${copy.short}`}
      destructive={turningOff}
      warning={noPayment ? <Banner tone="danger" testId={T('last-payment-warning')}>Sem PIX e sem cartão, ninguém consegue pagar.</Banner> : null}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

