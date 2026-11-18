'use client';

import { Minus, Plus, Scales } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, Switch, TextField, cx, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, type ExchangeSettings } from '@/lib/api/store-settings';
import { formatCents } from '@/lib/format';
import { centsInput, parseCents } from '@/lib/money';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { SettingsFrame } from './settings-frame';
import { SettingsScreen } from './settings-screen';

const T = (id: string) => ltid('trocas', id);
const MAX_FEE = 3000;

export function ExchangePage() {
  return <SettingsScreen>{({ store, settings, refresh }) => <ExchangeForm storeId={store.id} current={settings.exchangePolicy} refresh={refresh} />}</SettingsScreen>;
}

/** C5: política de trocas por tamanho ou cor. O piso legal (arrependimento e defeito) é fixo e só informativo (DEC-011). */
export function ExchangeForm({ storeId, current, refresh }: { storeId: string; current: ExchangeSettings; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(current.voluntaryDays > 0);
  const [days, setDays] = useState(current.voluntaryDays > 0 ? current.voluntaryDays : 7);
  const [fee, setFee] = useState(current.collectionFeeCents > 0 ? centsInput(current.collectionFeeCents) : '');
  const [errors, setErrors] = useState<{ days?: string; fee?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const feeCents = fee.trim() === '' ? 0 : parseCents(fee);
  const dirty = on !== current.voluntaryDays > 0 || (on && (days !== current.voluntaryDays || (feeCents ?? -1) !== current.collectionFeeCents));
  const setDaysClamped = (next: number) => setDays(Math.min(30, Math.max(1, next)));

  async function submit() {
    const next: typeof errors = {};
    if (on && (!Number.isInteger(days) || days < 1 || days > 30)) next.days = 'O prazo vai de 1 a 30 dias.';
    if (on && (feeCents === null || feeCents > MAX_FEE)) next.fee = 'A taxa vai até R$ 30,00.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      await settingsApi.setExchange(storeId, on ? { voluntaryDays: days, collectionFeeCents: feeCents ?? 0 } : { voluntaryDays: 0, collectionFeeCents: 0 });
      await refresh();
      toast.show('Política salva. Vale para novos pedidos.');
      router.push(asRoute('/lojista/loja'));
    } catch (caught) {
      setBusy(false);
      setFormError(caught instanceof ApiError && caught.fields.length > 0 ? caught.fields[0]!.message : saveErrorMessage(caught));
    }
  }

  return (
    <SettingsFrame
      screen="trocas"
      title="Política de trocas"
      dirty={dirty}
      busy={busy}
      submitLabel="Salvar política"
      onSubmit={() => void submit()}
      error={formError}
      aside={
        <div className={ui.stack} data-testid={T('preview')}>
          <h2 className="wb-text-title2" style={{ margin: 0 }}>Como o cliente vê</h2>
          <p className="wb-text-body" style={{ margin: 0 }}>
            {on ? `Troca por tamanho ou cor em até ${days} ${days === 1 ? 'dia' : 'dias'}. Coleta em casa: ${feeCents ? formatCents(feeCents) : 'grátis'}.` : 'Esta loja não faz troca por tamanho ou cor.'}
          </p>
        </div>
      }
    >
      <Switch checked={on} onChange={setOn} label="Aceito troca por tamanho ou cor" onText="Ligado" offText="Desligado" testId={T('voluntary-switch')} />
      {on ? (
        <>
          <div className={ui.stack}>
            <div className="wb-text-caption-strong">Prazo para pedir a troca</div>
            <div className={ui.row}>
              <Button variant="secondary" icon={<Minus size={20} aria-hidden="true" />} onClick={() => setDaysClamped(days - 1)} aria-label="Menos um dia" data-testid={T('days-minus')} />
              <TextField label="Dias" inputMode="numeric" value={String(days)} onChange={(event) => setDays(Number(event.target.value.replace(/\D/g, '')) || 0)} error={errors.days} data-testid={T('days-input')} />
              <Button variant="secondary" icon={<Plus size={20} aria-hidden="true" />} onClick={() => setDaysClamped(days + 1)} aria-label="Mais um dia" data-testid={T('days-plus')} />
            </div>
          </div>
          <TextField label="Taxa de coleta" inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} hint="Cobrada do cliente só se ele pedir a coleta em casa. De R$ 0,00 a R$ 30,00." error={errors.fee} data-testid={T('pickup-fee-input')} />
        </>
      ) : null}
      <div className={cx(ui.card)} data-testid={T('legal-card')} style={{ background: 'var(--wb-color-feedback-info-subtle)' }}>
        <div className={ui.row} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <Scales size={24} aria-hidden="true" />
          <p className={on ? 'wb-text-body' : 'wb-text-body-strong'} style={{ margin: 0 }}>
            {on ? `Valem sempre, por lei: arrependimento em até ${current.legalFloor.withdrawalDays} dias e produto com defeito. Você não pode desligar.` : `Arrependimento (${current.legalFloor.withdrawalDays} dias) e defeito continuam valendo por lei.`}
          </p>
        </div>
      </div>
      <Banner tone="info">A nova política vale para pedidos novos. Pedidos já feitos mantêm a política da época.</Banner>
    </SettingsFrame>
  );
}
