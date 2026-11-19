'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, RadioCards, Switch, TextArea, TextField, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, type DeliveryPreview, type StoreSettings } from '@/lib/api/store-settings';
import { maskCep, onlyDigits } from '@/lib/br/mask';
import { formatCents } from '@/lib/format';
import { parseDecimal } from '@/lib/money';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { SettingsFrame } from './settings-frame';
import { SettingsScreen } from './settings-screen';

const T = (id: string) => ltid('entrega', id);
const MAX_MINUTES = 1440;
/** Faixa aceita para o preparo da loja: a mesma do parâmetro `entrega_preparo_padrao_min` (5 a 120 min). */
export const PREP_MIN = 5;
export const PREP_MAX = 120;

type Errors = Partial<Record<'prep' | 'pickupEta' | 'pickupAddress', string>>;

/** Valor do campo: só o preparo que a loja definiu; se vale o padrão da Webag, o campo fica vazio. */
function storePrep(d: StoreSettings['delivery']): string {
  return d.prepMinutes && d.prepMinutesIsDefault !== true ? String(d.prepMinutes) : '';
}

export function DeliveryPage() {
  return <SettingsScreen>{({ store, settings, refresh }) => <DeliveryForm storeId={store.id} settings={settings} refresh={refresh} />}</SettingsScreen>;
}

/** C4 (DEC-036, DEC-053): a loja liga a entrega pela Webag e diz o tempo de preparo; taxa, raio e pedido mínimo são do admin. Retirada na loja. */
export function DeliveryForm({ storeId, settings, refresh }: { storeId: string; settings: StoreSettings; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const d = settings.delivery;
  const p = settings.pickup;
  const [delivery, setDelivery] = useState(d.acceptsDelivery);
  const [prep, setPrep] = useState(storePrep(d));
  const [pickup, setPickup] = useState(p.enabled);
  const [useStore, setUseStore] = useState(p.useStoreAddress);
  const [pickupAddress, setPickupAddress] = useState(p.address ?? '');
  const [notes, setNotes] = useState(p.instructions ?? '');
  const [prepMin, setPrepMin] = useState(String(p.prepMinMinutes));
  const [prepMax, setPrepMax] = useState(String(p.prepMaxMinutes));
  const [errors, setErrors] = useState<Errors>({});
  const [lastOff, setLastOff] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewCep, setPreviewCep] = useState('');
  const [previewNumber, setPreviewNumber] = useState('');
  const [preview, setPreview] = useState<{ cep: string; result: DeliveryPreview } | { error: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const initial = JSON.stringify([d.acceptsDelivery, storePrep(d), p.enabled, p.useStoreAddress, p.address ?? '', p.instructions ?? '', String(p.prepMinMinutes), String(p.prepMaxMinutes)]);
  const dirty = JSON.stringify([delivery, prep, pickup, useStore, pickupAddress, notes, prepMin, prepMax]) !== initial;

  /** Ao menos uma das duas fica ligada (C6): o switch que seria o último não desliga. */
  function toggleDelivery(next: boolean) {
    if (!next && !pickup) return setLastOff(true);
    setLastOff(false);
    setDelivery(next);
  }
  function togglePickup(next: boolean) {
    if (!next && !delivery) return setLastOff(true);
    setLastOff(false);
    setPickup(next);
  }

  async function submit() {
    const next: Errors = {};
    const prepN = prep.trim() === '' ? null : parseDecimal(prep);
    if (delivery && prep.trim() !== '' && (prepN === null || !Number.isInteger(prepN) || prepN < PREP_MIN || prepN > PREP_MAX)) next.prep = `Digite os minutos de preparo, de ${PREP_MIN} a ${PREP_MAX}.`;
    if (pickup) {
      const a = parseDecimal(prepMin);
      const b = parseDecimal(prepMax);
      if (a === null || b === null || a < 1) next.pickupEta = 'Digite os minutos de preparo.';
      else if (a >= b) next.pickupEta = 'O mínimo precisa ser menor que o máximo.';
      else if (b > MAX_MINUTES) next.pickupEta = 'O máximo é 1.440 minutos.';
      if (!useStore && pickupAddress.trim().length < 5) next.pickupAddress = 'Escreva o endereço de retirada.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setFormError(null);
    try {
      await settingsApi.setDelivery(storeId, {
        acceptsDelivery: delivery,
        prepMinutes: prepN,
      });
      await settingsApi.setPickup(storeId, {
        enabled: pickup,
        useStoreAddress: useStore,
        ...(!useStore && pickupAddress.trim() ? { address: pickupAddress.trim() } : {}),
        ...(notes.trim() ? { instructions: notes.trim() } : {}),
        prepMinMinutes: parseDecimal(prepMin) ?? p.prepMinMinutes,
        prepMaxMinutes: parseDecimal(prepMax) ?? p.prepMaxMinutes,
      });
      await refresh();
      toast.show('Entrega e retirada salvas.');
      router.push(asRoute('/lojista/loja'));
    } catch (caught) {
      setBusy(false);
      setFormError(caught instanceof ApiError && caught.fields.length > 0 ? caught.fields[0]!.message : saveErrorMessage(caught));
    }
  }

  async function runPreview() {
    const cep = onlyDigits(previewCep);
    if (cep.length !== 8) return setPreview({ error: 'Digite um CEP com 8 números.' });
    setPreviewing(true);
    try {
      setPreview({ cep: maskCep(cep), result: await settingsApi.preview(storeId, { cep, subtotalCents: 0 }) });
    } catch (caught) {
      setPreview({ error: caught instanceof ApiError && caught.isNetwork ? 'Conecte-se para ver a prévia.' : caught instanceof ApiError && caught.fields[0] ? caught.fields[0].message : 'Não foi possível calcular agora. Tente de novo.' });
    } finally {
      setPreviewing(false);
    }
  }

  const previewText = (cep: string, r: DeliveryPreview): string => {
    if (!r.available) return 'Fora da área: o cliente não vê sua loja nesse endereço.';
    const fee = (r.feeCents ?? 0) === 0 ? 'nada (grátis)' : formatCents(r.feeCents ?? 0);
    const eta = r.eta ? ` e recebe em ${r.eta.minMinutes} a ${r.eta.maxMinutes} min` : '';
    return `Para o CEP ${cep} o cliente paga ${fee}${eta} (${((r.distanceM ?? 0) / 1000).toFixed(1).replace('.', ',')} km).`;
  };

  return (
    <SettingsFrame
      screen="entrega"
      title="Entrega e retirada"
      dirty={dirty}
      busy={busy}
      submitLabel="Salvar entrega e retirada"
      onSubmit={() => void submit()}
      error={formError}
      aside={
        <div className={ui.stack} data-testid={T('preview-card')}>
          <h2 className="wb-text-title2" style={{ margin: 0 }}>Prévia do cliente</h2>
          <p className="wb-text-caption" style={{ margin: 0 }}>Usa o que está salvo. Salve antes para testar uma mudança.</p>
          <TextField label="CEP" inputMode="numeric" value={previewCep} onChange={(e) => setPreviewCep(maskCep(e.target.value))} placeholder="00000-000" data-testid={T('preview-cep')} />
          <TextField label="Número" value={previewNumber} onChange={(e) => setPreviewNumber(e.target.value)} data-testid={T('preview-number')} />
          <div>
            <Button variant="secondary" onClick={() => void runPreview()} loading={previewing} loadingLabel="Calculando…" disabled={!online} data-testid={T('preview-run')}>Ver prévia</Button>
          </div>
          {!online ? <p className="wb-text-caption" style={{ margin: 0 }}>Conecte-se para ver a prévia.</p> : null}
          {preview ? (
            <p className="wb-text-body" role="status" style={{ margin: 0 }} data-testid={T('preview-result')}>
              {'error' in preview ? preview.error : previewText(preview.cep, preview.result)}
            </p>
          ) : null}
        </div>
      }
    >
      <section className={ui.stack} aria-labelledby="entrega-titulo">
        <h2 id="entrega-titulo" className="wb-text-title2" style={{ margin: 0 }}>Entrega pela Webag</h2>
        <Switch checked={delivery} onChange={toggleDelivery} label="Entregar em casa" onText="Ligado" offText="Desligado" testId={T('delivery-switch')} />
        {lastOff ? <p role="alert" className="wb-text-caption" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }} data-testid={T('last-off')}>Ligue a entrega ou a retirada. A loja precisa de ao menos uma.</p> : null}
        {delivery ? (
          <>
            <Banner tone="info" testId={T('webag-delivers')}>A Webag cuida do motoboy. A taxa, o raio e o pedido mínimo são definidos por região, e o cliente vê uma faixa de horário para receber.</Banner>
            <TextField
              label="Tempo de preparo (min)"
              inputMode="numeric"
              value={prep}
              onChange={(e) => setPrep(e.target.value.replace(/\D/g, '').slice(0, 3))}
              error={errors.prep}
              hint={`Do aceite até o pedido ficar pronto para coleta, de ${PREP_MIN} a ${PREP_MAX} min. ${d.prepMinutesIsDefault && d.prepMinutes ? `Hoje vale o padrão da Webag, ${d.prepMinutes} min. ` : ''}Vazio usa o padrão da Webag. Preparo longo aumenta a faixa que o cliente vê.`}
              data-testid={T('prep-input')}
            />
          </>
        ) : null}
      </section>

      <section className={ui.stack} aria-labelledby="retirada-titulo">
        <h2 id="retirada-titulo" className="wb-text-title2" style={{ margin: 0 }}>Retirada</h2>
        <Switch checked={pickup} onChange={togglePickup} label="Retirada na loja" onText="Ligada" offText="Desligada" testId={T('pickup-switch')} />
        {!pickup && p.enabled ? <p className="wb-text-caption" style={{ margin: 0 }}>Pedidos de retirada em andamento seguem normalmente.</p> : null}
        {pickup ? (
          <>
            <RadioCards
              legend="Endereço de retirada"
              name="pickup-address"
              value={useStore ? 'store' : 'other'}
              onChange={(value) => setUseStore(value === 'store')}
              options={[
                { value: 'store', label: 'Usar o endereço da loja', testId: T('pickup-address-store') },
                { value: 'other', label: 'Outro endereço', testId: T('pickup-address-other') },
              ]}
            />
            {!useStore ? <TextField label="Endereço de retirada" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} error={errors.pickupAddress} autoComplete="street-address" data-testid={T('pickup-address-input')} /> : null}
            <TextArea label="Instruções (opcional)" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))} counter={{ value: notes.length, max: 200 }} rows={2} data-testid={T('pickup-notes')} />
            <div className={ui.stack}>
              <div className={ui.row} style={{ alignItems: 'flex-end' }}>
                <TextField label="Preparo, de (min)" inputMode="numeric" value={prepMin} onChange={(e) => setPrepMin(e.target.value)} data-testid={T('pickup-prep-min')} />
                <TextField label="até (min)" inputMode="numeric" value={prepMax} onChange={(e) => setPrepMax(e.target.value)} data-testid={T('pickup-prep-max')} />
              </div>
              {errors.pickupEta ? <p role="alert" className="wb-text-caption" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>{errors.pickupEta}</p> : null}
            </div>
            <Banner tone="info">O cliente recebe um código de 4 dígitos. Peça o código para entregar o pedido.</Banner>
          </>
        ) : null}
      </section>
    </SettingsFrame>
  );
}
