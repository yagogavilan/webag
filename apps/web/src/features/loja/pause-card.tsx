'use client';

import { PauseCircle, PlayCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { Banner, Button, Dialog, cx, ui, useToast } from '@/components/ui';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, type PauseKind, type StoreSettings } from '@/lib/api/store-settings';
import { formatClock } from '@/lib/format';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './loja.module.css';

export const PAUSE_OPTIONS: { kind: PauseKind; chip: string; confirm: string }[] = [
  { kind: '30m', chip: '30 min', confirm: 'Pausar por 30 min' },
  { kind: '1h', chip: '1 h', confirm: 'Pausar por 1 h' },
  { kind: '2h', chip: '2 h', confirm: 'Pausar por 2 h' },
  { kind: 'end_of_day', chip: 'Até o fim do dia', confirm: 'Pausar até o fim do dia' },
  { kind: 'until_resume', chip: 'Até eu reabrir', confirm: 'Pausar até eu reabrir' },
];

export function pauseText(pause: StoreSettings['pause']): string {
  if (pause.indefinitely) return 'Pausada até você reabrir';
  return pause.until ? `Pausada até ${formatClock(pause.until)}` : 'Pausada';
}

/** Pausar agora e reabrir (C1 e C3): ação imediata, fora do botão "Salvar" do formulário. */
export function PauseCard({ storeId, settings, refresh, screen }: { storeId: string; settings: StoreSettings; refresh: () => Promise<unknown>; screen: string }) {
  const toast = useToast();
  const online = useOnline();
  const [kind, setKind] = useState<PauseKind>('1h');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const T = (id: string) => ltid(screen, id);
  const option = PAUSE_OPTIONS.find((item) => item.kind === kind)!;

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
      toast.show(message);
      setConfirming(false);
    } catch (caught) {
      setError(saveErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    await run(() => settingsApi.pause(storeId, kind), kind === 'until_resume' ? 'Loja pausada.' : kind === 'end_of_day' ? 'Loja pausada até o fim do dia.' : `Loja pausada por ${option.chip}.`);
  }

  if (settings.pause.active) {
    return (
      <div className={cx(ui.card, ui.stack)} data-testid={T('status-card')}>
        <p className="wb-text-title2" style={{ margin: 0 }} role="status">{pauseText(settings.pause)}</p>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <div>
          <Button icon={<PlayCircle size={24} aria-hidden="true" />} onClick={() => void run(() => settingsApi.resume(storeId), 'Loja reaberta.')} loading={busy} loadingLabel="Reabrindo…" disabled={!online} data-testid={T('reopen')}>
            Reabrir agora
          </Button>
        </div>
        {!online ? <p className="wb-text-caption" style={{ margin: 0 }}>Conecte-se para reabrir a loja.</p> : null}
      </div>
    );
  }

  return (
    <div className={cx(ui.card, ui.stack)} data-testid={T('status-card')}>
      <p className="wb-text-title2" style={{ margin: 0 }} role="status">{settings.isOpenNow ? 'Loja aberta' : 'Loja fechada agora'}</p>
      <div role="group" aria-label="Por quanto tempo pausar" className={s.chips}>
        {PAUSE_OPTIONS.map((item) => (
          <button key={item.kind} type="button" className={ui.chip} aria-pressed={kind === item.kind} onClick={() => setKind(item.kind)} data-testid={T(`pause-chip-${item.kind}`)}>
            {item.chip}
          </button>
        ))}
      </div>
      {!online ? <p className="wb-text-caption" style={{ margin: 0 }}>Conecte-se para pausar a loja.</p> : null}
      <div>
        <Button variant="secondary" icon={<PauseCircle size={24} aria-hidden="true" />} onClick={() => (online ? setConfirming(true) : setError('Conecte-se para pausar a loja.'))} data-testid={T('pause-open')}>
          Pausar loja
        </Button>
      </div>
      {error && !confirming ? <Banner tone="danger" offline={!online}>{error}</Banner> : null}
      {confirming ? (
        <Dialog
          title="Pausar a loja?"
          onClose={() => setConfirming(false)}
          locked={busy}
          testId={T('pause-dialog')}
          actions={
            <>
              <Button loading={busy} loadingLabel="Pausando…" onClick={() => void pause()} data-testid={T('pause-submit')}>
                {option.confirm}
              </Button>
              <Button variant="text" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Pedidos em andamento continuam. Novos pedidos não entram.</p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </Dialog>
      ) : null}
    </div>
  );
}
