'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Banner, Button, ui, useToast } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type BulkUndoResult } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';

const T = (id: string) => ltid('precos', id);
export const UNDO_WINDOW_MS = 10 * 60_000;

export interface UndoBatch {
  batchId: string;
  /** ISO 8601 (`undoUntil` do servidor). */
  undoUntil: string;
  count: number;
}

/** Segundos que faltam, a partir do `undoUntil` do servidor, nunca acima da janela de 10 min (relógio do aparelho errado não estica o prazo). */
export function secondsLeft(undoUntil: string, now: number): number {
  const end = Date.parse(undoUntil);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.min(Math.ceil((end - now) / 1000), UNDO_WINDOW_MS / 1000));
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Anuncia só em 5:00, 1:00 e ao expirar (design §4): nunca a cada segundo. */
export function announcement(seconds: number): string {
  if (seconds <= 0) return 'O prazo para desfazer acabou.';
  if (seconds <= 60) return 'Falta 1 minuto para desfazer o reajuste.';
  if (seconds <= 300) return 'Faltam 5 minutos para desfazer o reajuste.';
  return '';
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function undoOutcome(result: BulkUndoResult): string {
  if (result.skipped.length === 0) return 'Preços voltaram ao valor anterior.';
  const names = result.skipped.slice(0, 3).map((item) => item.name).join(', ');
  const more = result.skipped.length > 3 ? ` e mais ${result.skipped.length - 3}` : '';
  const back = result.reverted === 0 ? 'Nenhum preço voltou' : `${plural(result.reverted, 'preço voltou', 'preços voltaram')} ao valor anterior`;
  return `${back}. ${plural(result.skipped.length, 'produto foi editado', 'produtos foram editados')} depois do reajuste e não mudou: ${names}${more}.`;
}

type Phase = { kind: 'ready' } | { kind: 'busy' } | { kind: 'done'; message: string } | { kind: 'error'; message: string } | { kind: 'expired' };

/**
 * Aviso de desfazer depois de um reajuste em massa (WB-377 C4): contador em texto, botão "Desfazer" por 10 minutos e, depois,
 * só o texto de que o prazo acabou. Desfazer é idempotente no servidor, então o erro de rede deixa o botão para tentar de novo.
 * Nunca sobrescreve edição posterior: o servidor devolve em `skipped` o que não voltou e a tela diz quais.
 */
export function UndoNotice({ storeId, batch, onUndone }: { storeId: string; batch: UndoBatch; onUndone: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const seconds = secondsLeft(batch.undoUntil, now);
  const expired = seconds <= 0;
  const active = phase.kind === 'ready' || phase.kind === 'busy' || phase.kind === 'error';

  useEffect(() => {
    if (!active || expired) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, expired]);

  async function undo() {
    if (!online) return setPhase({ kind: 'error', message: 'Sem internet. Conecte para desfazer; nada foi desfeito.' });
    setPhase({ kind: 'busy' });
    try {
      const result = await catalogApi.undoBulk(storeId, batch.batchId);
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      const message = undoOutcome(result);
      setPhase({ kind: 'done', message });
      toast.show(result.skipped.length === 0 ? 'Preços voltaram ao valor anterior.' : 'Desfazer parcial: veja o aviso na tela.');
      onUndone();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'UNDO_WINDOW_EXPIRED') return setPhase({ kind: 'expired' });
      const message = caught instanceof ApiError && caught.isNetwork ? 'Sem internet. Nada foi desfeito. Toque em Desfazer para tentar de novo.' : catalogErrorMessage(caught, 'Não foi possível desfazer. Nada foi alterado. Tente de novo.');
      setPhase({ kind: 'error', message });
    }
  }

  if (phase.kind === 'done') return <Banner tone="success" testId={T('undo-done')}>{phase.message}</Banner>;
  if (phase.kind === 'expired' || (expired && phase.kind !== 'busy')) {
    return <Banner tone="info" testId={T('undo-expired')}>{`Preços reajustados em ${plural(batch.count, 'produto', 'produtos')}. O prazo para desfazer acabou.`}</Banner>;
  }
  const note = announcement(seconds);
  return (
    <div className={ui.stack} data-testid={T('undo')}>
      <Banner
        tone="info"
        quiet
        action={
          <Button variant="secondary" onClick={() => void undo()} loading={phase.kind === 'busy'} loadingLabel="Desfazendo…" disabled={!online} data-testid={T('undo-button')}>
            Desfazer
          </Button>
        }
      >
        Preços reajustados em {plural(batch.count, 'produto', 'produtos')}. Dá para desfazer por <strong data-testid={T('undo-clock')}>{clock(seconds)}</strong>.
        {!online ? ' Sem internet: conecte para desfazer.' : ''}
      </Banner>
      {phase.kind === 'error' ? <Banner tone="danger" testId={T('undo-error')}>{phase.message}</Banner> : null}
      <p className={ui.srOnly} role="status" data-testid={T('undo-live')}>{note}</p>
    </div>
  );
}
