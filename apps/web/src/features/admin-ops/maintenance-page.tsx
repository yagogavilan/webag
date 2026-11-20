'use client';

import { Wrench } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { NightBlock } from '@/components/panel/blocks';
import { maintenanceKey } from '@/components/panel/maintenance-banner';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, ErrorState, NoAccessState, SkeletonRows, TextArea, TextField, cx, useToast } from '@/components/ui';
import { actionLabel } from '@/features/audit/catalog';
import { adminApi } from '@/lib/api/admin';
import { adminOpsApi, adminOpsKeys } from '@/lib/api/admin-ops';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatFullDateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { PROFILE_LABEL } from '@/lib/admin-access';
import { MAINTENANCE_FALLBACK, expectedBackText } from '@/lib/maintenance';
import type { AdminProfile } from '@/lib/session-types';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { useIsOffline } from './common';
import s from './ops.module.css';

const T = (id: string) => tid('manutencao', id);
const MESSAGE_MIN = 5;
const MESSAGE_MAX = 200;

export function maintenanceError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para continuar. Nada foi alterado.';
    if (caught.status === 403) return 'Só o super admin liga ou desliga o modo manutenção.';
    if (caught.status === 400 || caught.status === 422) return caught.fields[0]?.message ?? 'Confira a mensagem e a previsão de volta (precisa estar no futuro).';
  }
  return saveErrorMessage(caught, 'Não foi possível salvar. Nada foi alterado. Tente de novo.');
}

/** Erro da mensagem opcional (5 a 200 caracteres) e da previsão (futura). Vazio é válido: vale o texto padrão e nenhuma previsão. */
export function maintenanceFormError(message: string, expectedBackLocal: string, now: Date = new Date()): string | null {
  const text = message.trim();
  if (text !== '' && text.length < MESSAGE_MIN) return `A mensagem precisa ter ao menos ${MESSAGE_MIN} caracteres, ou deixe em branco para usar o texto padrão.`;
  if (expectedBackLocal) {
    const iso = fromLocalInput(expectedBackLocal);
    if (!iso) return 'A previsão de volta não é uma data válida.';
    if (new Date(iso).getTime() <= now.getTime()) return 'A previsão de volta precisa estar no futuro.';
  }
  return null;
}

/** WB-121: tela do super admin. Liga e desliga com motivo, mostra o que para e o que continua, e o histórico da auditoria. */
export function MaintenancePage() {
  const { canView, canEdit } = useSession();
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const [mode, setMode] = useState<'on' | 'off' | null>(null);
  const [message, setMessage] = useState('');
  const [back, setBack] = useState('');
  const allowed = canView('manutencao');
  const query = useQuery({ queryKey: adminOpsKeys.maintenance, queryFn: () => adminOpsApi.maintenance(), enabled: allowed });
  const history = useQuery({
    queryKey: ['admin', 'audit', 'maintenance'],
    queryFn: () => adminApi.audit({ targetType: 'platform', targetId: 'maintenance' }),
    enabled: allowed,
  });
  const offline = useIsOffline(query.error);
  if (!allowed) return <NoAccessState />;
  if (query.isPending) return <SkeletonRows rows={3} height={110} label="Carregando o modo manutenção" />;
  if (query.isError && !query.data) return <ErrorState offline={offline} onRetry={() => void query.refetch()} testId={T('error')} />;
  const status = query.data;
  if (!status) return null;
  const formError = mode === 'on' ? maintenanceFormError(message, back) : null;
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: adminOpsKeys.maintenance }), client.invalidateQueries({ queryKey: maintenanceKey('admin') }), client.invalidateQueries({ queryKey: ['admin', 'audit'] })]);
  const backText = expectedBackText(status.expectedBackAt);

  return (
    <div className={s.page}>
      <PageHeader title="Modo manutenção" description="Pare os pedidos novos para atualizar a plataforma com segurança." action={<Badge tone={status.active ? 'warning' : 'success'} testId={T('state')}>{status.active ? 'Ligado' : 'Desligado'}</Badge>} />
      {status.active ? (
        <NightBlock icon="alert" title="A plataforma está em manutenção" testId={T('on-block')}>
          {status.message ?? MAINTENANCE_FALLBACK} {backText ?? 'Sem previsão de volta informada.'}
        </NightBlock>
      ) : (
        <Banner tone="info" testId={T('off-info')}>A plataforma está funcionando normalmente. Ligue o modo manutenção só quando for atualizar algo que não pode receber pedidos.</Banner>
      )}

      <div className={s.blocks}>
        <section className={s.block} aria-labelledby="mt-stop" data-testid={T('stops')}>
          <h2 id="mt-stop" className="wb-text-title2">O que para</h2>
          <ul className={s.effects}>
            <li className="wb-text-body">Novos pedidos no app e no site: o cliente vê a mensagem de manutenção.</li>
            <li className="wb-text-body">Novos pagamentos por cartão pela página segura.</li>
          </ul>
        </section>
        <section className={s.block} aria-labelledby="mt-keep" data-testid={T('keeps')}>
          <h2 id="mt-keep" className="wb-text-title2">O que continua</h2>
          <ul className={s.effects}>
            <li className="wb-text-body">Navegar pelas lojas e manter a sacola (nada se perde).</li>
            <li className="wb-text-body">Pedidos já criados: pagar o PIX gerado, acompanhar e receber.</li>
            <li className="wb-text-body">A loja aceitando e preparando, e a Logística despachando.</li>
            <li className="wb-text-body">Recebimento de avisos do Mercado Pago (nenhum pagamento se perde).</li>
            <li className="wb-text-body">Este painel e o painel do lojista.</li>
          </ul>
        </section>
      </div>
      <p className={cx('wb-text-caption', s.muted)}>A previsão de volta é só um aviso: a manutenção não desliga sozinha. Quem desliga é você.</p>

      {canEdit('manutencao') ? (
        <div>
          {status.active ? (
            <Button variant="primary" icon={<Wrench size={20} aria-hidden="true" />} onClick={() => setMode('off')} disabled={!online} data-testid={T('turn-off')}>Desligar manutenção</Button>
          ) : (
            <Button variant="destructive" icon={<Wrench size={20} aria-hidden="true" />} onClick={() => { setMessage(''); setBack(''); setMode('on'); }} disabled={!online} data-testid={T('turn-on')}>Ligar modo manutenção</Button>
          )}
        </div>
      ) : null}

      <section className={s.block} aria-labelledby="mt-audit" data-testid={T('audit')}>
        <h2 id="mt-audit" className="wb-text-title2">Quem mexeu e quando</h2>
        {status.updatedAt ? <p className={cx('wb-text-body', s.muted)} data-testid={T('last')}>Última alteração em {formatFullDateTime(status.updatedAt)}{status.updatedByName ? ` por ${status.updatedByName}` : ''}.</p> : <p className={cx('wb-text-body', s.muted)}>O modo manutenção nunca foi ligado.</p>}
        {history.isError ? <p className={cx('wb-text-caption', s.muted)}>Não foi possível carregar o histórico agora. Ele está na Auditoria.</p> : null}
        {history.data && history.data.data.length > 0 ? (
          <ol className={s.timeline} data-testid={T('history')}>
            {history.data.data.slice(0, 8).map((row) => (
              <li key={row.id} className="wb-text-body">
                {formatFullDateTime(row.at)} · {actionLabel(row.action)}{row.actorRole ? ` · ${PROFILE_LABEL[row.actorRole as AdminProfile] ?? row.actorRole}` : ''}{row.reason ? `. Motivo: ${row.reason}` : ''}
              </li>
            ))}
          </ol>
        ) : null}
        <Link href={asRoute('/admin/auditoria?targetType=platform&targetId=maintenance')} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T('audit-link')}>Ver tudo na Auditoria</Link>
      </section>

      {mode === 'on' ? (
        <ReasonDialog
          title="Ligar o modo manutenção?"
          description={
            <>
              <p style={{ margin: 0 }}>Ao confirmar, ninguém consegue criar pedido novo, no app e no site, até você desligar. Pedidos já criados seguem normalmente.</p>
            </>
          }
          confirmLabel="Ligar manutenção"
          destructive
          minReason={5}
          maxReason={300}
          extra={
            <>
              <TextArea label="Mensagem para o cliente (opcional)" value={message} onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))} counter={{ value: message.length, max: MESSAGE_MAX }} hint="Em branco, o app mostra o texto padrão." rows={2} data-testid={T('message')} />
              <TextField label="Previsão de volta (opcional)" type="datetime-local" value={back} onChange={(e) => setBack(e.target.value)} min={toLocalInput(new Date())} hint="Só um aviso para o cliente. Não desliga sozinha." data-testid={T('expected-back')} />
            </>
          }
          precheck={() => formError}
          testIds={{ dialog: T('on-dialog'), reason: T('reason'), confirm: T('on-confirm') }}
          onConfirm={async (reason) => {
            try {
              await adminOpsApi.setMaintenance({ enabled: true, reason, ...(message.trim() ? { message: message.trim() } : {}), ...(back ? { expectedBackAt: fromLocalInput(back) } : {}) });
            } catch (caught) {
              throw new UserMessageError(maintenanceError(caught));
            }
            await refresh();
            toast.show('Modo manutenção ligado. Registrado na auditoria.');
          }}
          onClose={() => setMode(null)}
        />
      ) : null}
      {mode === 'off' ? (
        <ReasonDialog
          title="Desligar o modo manutenção?"
          description="Os pedidos novos voltam na hora, sem o cliente precisar fazer nada."
          confirmLabel="Desligar manutenção"
          minReason={5}
          maxReason={300}
          testIds={{ dialog: T('off-dialog'), reason: T('reason'), confirm: T('off-confirm') }}
          onConfirm={async (reason) => {
            try {
              await adminOpsApi.setMaintenance({ enabled: false, reason });
            } catch (caught) {
              throw new UserMessageError(maintenanceError(caught));
            }
            await refresh();
            toast.show('Modo manutenção desligado. Registrado na auditoria.');
          }}
          onClose={() => setMode(null)}
        />
      ) : null}
    </div>
  );
}
