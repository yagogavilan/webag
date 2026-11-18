'use client';

import { Minus, Plus } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, RadioCards, Switch, TextArea, TextField, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, type DeliveryPreview, type StoreSettings } from '@/lib/api/store-settings';
import { maskCep, onlyDigits } from '@/lib/br/mask';
import { formatCents } from '@/lib/format';
import { centsInput, kmInput, parseCents, parseDecimal } from '@/lib/money';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { SettingsFrame } from './settings-frame';
import { SettingsScreen } from './settings-screen';

const T = (id: string) => ltid('entrega', id);
const MAX_TIERS = 5;
const MAX_FEE = 5000;
const MAX_MINUTES = 1440;

interface Band {
  to: string;
  fee: string;
}
type Errors = Partial<Record<'radius' | 'fee' | 'bands' | 'minOrder' | 'freeAbove' | 'eta' | 'mode' | 'pickupEta' | 'pickupAddress', string>>;

export function DeliveryPage() {
  return <SettingsScreen>{({ store, settings, refresh }) => <DeliveryForm storeId={store.id} settings={settings} refresh={refresh} />}</SettingsScreen>;
}

function bandsFrom(settings: StoreSettings['delivery']): Band[] {
  return settings.tiers.length > 0 ? settings.tiers.map((t) => ({ to: kmInput(t.toKm), fee: t.feeCents > 0 ? centsInput(t.feeCents) : '' })) : [{ to: kmInput(settings.radiusKm), fee: '' }];
}

/** C4: entrega (raio, taxa fixa ou por faixa, mínimo, grátis acima de, tempo) e retirada. */
export function DeliveryForm({ storeId, settings, refresh }: { storeId: string; settings: StoreSettings; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const d = settings.delivery;
  const p = settings.pickup;
  const [delivery, setDelivery] = useState(d.acceptsDelivery);
  const [radius, setRadius] = useState(kmInput(d.radiusKm));
  const [mode, setMode] = useState(d.feeMode);
  const [fixed, setFixed] = useState(d.feeFixedCents > 0 ? centsInput(d.feeFixedCents) : '');
  const [bands, setBands] = useState<Band[]>(bandsFrom(d));
  const [minOrder, setMinOrder] = useState(d.minOrderCents > 0 ? centsInput(d.minOrderCents) : '');
  const [freeAbove, setFreeAbove] = useState(d.freeAboveCents > 0 ? centsInput(d.freeAboveCents) : '');
  const [etaMin, setEtaMin] = useState(String(d.etaMinMinutes));
  const [etaMax, setEtaMax] = useState(String(d.etaMaxMinutes));
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

  const radiusKm = parseDecimal(radius);
  const etaMinN = parseDecimal(etaMin);
  const etaMaxN = parseDecimal(etaMax);

  const initial = JSON.stringify([d.acceptsDelivery, kmInput(d.radiusKm), d.feeMode, (d.feeFixedCents > 0 ? centsInput(d.feeFixedCents) : ''), bandsFrom(d), d.minOrderCents > 0 ? centsInput(d.minOrderCents) : '', d.freeAboveCents > 0 ? centsInput(d.freeAboveCents) : '', String(d.etaMinMinutes), String(d.etaMaxMinutes), p.enabled, p.useStoreAddress, p.address ?? '', p.instructions ?? '', String(p.prepMinMinutes), String(p.prepMaxMinutes)]);
  const dirty = JSON.stringify([delivery, radius, mode, fixed, bands, minOrder, freeAbove, etaMin, etaMax, pickup, useStore, pickupAddress, notes, prepMin, prepMax]) !== initial;

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

  const setBand = (index: number, patch: Partial<Band>) => setBands((current) => current.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  function addBand() {
    setBands((current) => {
      const last = current[current.length - 1]!;
      const from = current.length > 1 ? (parseDecimal(current[current.length - 2]!.to) ?? 0) : 0;
      const end = radiusKm ?? parseDecimal(last.to) ?? 5;
      const middle = Math.max(from + 0.1, Math.round(((from + end) / 2) * 10) / 10);
      return [...current.slice(0, -1), { ...last, to: kmInput(middle) }, { to: kmInput(end), fee: last.fee }];
    });
  }

  async function submit() {
    const next: Errors = {};
    if (delivery) {
      if (radiusKm === null || radiusKm < 1) next.radius = 'O raio mínimo é 1 km.';
      if (mode === 'fixed') {
        const fee = fixed.trim() === '' ? 0 : parseCents(fixed);
        if (fee === null || fee > MAX_FEE) next.fee = 'A taxa vai de R$ 0,00 a R$ 50,00.';
      } else if (radiusKm !== null) {
        let from = 0;
        bands.forEach((band, index) => {
          const to = index === bands.length - 1 ? radiusKm : parseDecimal(band.to);
          const fee = band.fee.trim() === '' ? 0 : parseCents(band.fee);
          if (to === null || to <= from || fee === null || fee > MAX_FEE) next.bands = next.bands ?? `Confira a faixa ${index + 1}: o "Até" precisa passar do anterior e a taxa vai até R$ 50,00.`;
          from = to ?? from;
        });
      }
      const min = minOrder ? parseCents(minOrder) : 0;
      const free = freeAbove ? parseCents(freeAbove) : 0;
      if (min === null) next.minOrder = 'Digite um valor em reais.';
      if (free === null) next.freeAbove = 'Digite um valor em reais.';
      else if (free > 0 && min !== null && free <= min) next.freeAbove = `Precisa ser maior que o pedido mínimo de ${formatCents(min)}.`;
      if (etaMinN === null || etaMaxN === null || etaMinN < 1) next.eta = 'Digite os minutos.';
      else if (etaMinN >= etaMaxN) next.eta = 'O mínimo precisa ser menor que o máximo.';
      else if (etaMaxN > MAX_MINUTES) next.eta = 'O máximo é 1.440 minutos.';
    }
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
      const tiers = (() => {
        if (mode !== 'by_distance') return [];
        let from = 0;
        return bands.map((band, index) => {
          const to = index === bands.length - 1 ? radiusKm! : parseDecimal(band.to)!;
          const tier = { fromKm: from, toKm: to, feeCents: band.fee.trim() === '' ? 0 : (parseCents(band.fee) ?? 0) };
          from = to;
          return tier;
        });
      })();
      await settingsApi.setDelivery(storeId, {
        acceptsDelivery: delivery,
        radiusKm: radiusKm ?? d.radiusKm,
        feeMode: mode,
        feeFixedCents: mode === 'fixed' ? (fixed.trim() === '' ? 0 : (parseCents(fixed) ?? 0)) : 0,
        tiers,
        minOrderCents: (minOrder ? parseCents(minOrder) : 0) ?? 0,
        freeAboveCents: (freeAbove ? parseCents(freeAbove) : 0) ?? 0,
        etaMinMinutes: etaMinN ?? d.etaMinMinutes,
        etaMaxMinutes: etaMaxN ?? d.etaMaxMinutes,
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

  const etaText = etaMinN && etaMaxN ? `${etaMinN} a ${etaMaxN} min` : '';
  const stepper = (value: string, set: (v: string) => void, label: string, testId: string, error?: string) => (
    <div className={ui.row} style={{ alignItems: 'flex-end' }}>
      <Button variant="secondary" icon={<Minus size={20} aria-hidden="true" />} aria-label={`Diminuir ${label}`} onClick={() => set(kmInput(Math.max(1, (parseDecimal(value) ?? 1) - 1)))} />
      <TextField label={label} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} error={error} data-testid={testId} />
      <Button variant="secondary" icon={<Plus size={20} aria-hidden="true" />} aria-label={`Aumentar ${label}`} onClick={() => set(kmInput((parseDecimal(value) ?? 0) + 1))} />
    </div>
  );

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
              {'error' in preview
                ? preview.error
                : preview.result.available
                  ? `Para o CEP ${preview.cep} o cliente paga ${(preview.result.feeCents ?? 0) === 0 ? 'nada (grátis)' : formatCents(preview.result.feeCents ?? 0)} e recebe em ${d.etaMinMinutes} a ${d.etaMaxMinutes} min (${((preview.result.distanceM ?? 0) / 1000).toFixed(1).replace('.', ',')} km).`
                  : 'Fora do raio: o cliente não vê sua loja nesse endereço.'}
            </p>
          ) : null}
        </div>
      }
    >
      <section className={ui.stack} aria-labelledby="entrega-titulo">
        <h2 id="entrega-titulo" className="wb-text-title2" style={{ margin: 0 }}>Entrega</h2>
        <Switch checked={delivery} onChange={toggleDelivery} label="Entregar em casa" onText="Ligado" offText="Desligado" testId={T('delivery-switch')} />
        {lastOff ? <p role="alert" className="wb-text-caption" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }} data-testid={T('last-off')}>Ligue a entrega ou a retirada. A loja precisa de ao menos uma.</p> : null}
        {delivery ? (
          <>
            {stepper(radius, setRadius, 'Raio de entrega (km)', T("radius-input"), errors.radius)}
            <div role="group" aria-label="Como cobrar a taxa" className={ui.row}>
              <button type="button" className={ui.chip} aria-pressed={mode === 'fixed'} onClick={() => setMode('fixed')} data-testid={T('fee-mode-fixed')}>Taxa fixa</button>
              <button type="button" className={ui.chip} aria-pressed={mode === 'by_distance'} onClick={() => setMode('by_distance')} data-testid={T('fee-mode-distance')}>Por distância</button>
            </div>
            {mode === 'fixed' ? (
              <TextField label="Taxa de entrega" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} hint={fixed.trim() === '' || parseCents(fixed) === 0 ? 'Grátis. Digite um valor para cobrar (até R$ 50,00).' : 'De R$ 0,00 a R$ 50,00.'} error={errors.fee} data-testid={T('fee-input')} />
            ) : (
              <div className={ui.stack}>
                {bands.map((band, index) => {
                  const last = index === bands.length - 1;
                  const from = index === 0 ? 0 : (parseDecimal(bands[index - 1]!.to) ?? 0);
                  return (
                    <div key={index} className="wb-text-body" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 12, alignItems: 'end' }}>
                      <span style={{ paddingBottom: 12 }}>De {kmInput(from)} km</span>
                      <TextField label="Até (km)" inputMode="decimal" value={last ? (radiusKm !== null ? kmInput(radiusKm) : '') : band.to} disabled={last} hint={last ? 'Vai até o raio' : undefined} onChange={(e) => setBand(index, { to: e.target.value })} data-testid={T(`band-${index + 1}-to`)} />
                      <TextField label="Valor" inputMode="decimal" value={band.fee} onChange={(e) => setBand(index, { fee: e.target.value })} data-testid={T(`band-${index + 1}-fee`)} />
                    </div>
                  );
                })}
                {errors.bands ? <p role="alert" className="wb-text-caption" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>{errors.bands}</p> : null}
                <div className={ui.row}>
                  {bands.length < MAX_TIERS ? (
                    <Button variant="secondary" size="sm" onClick={addBand} data-testid={T('band-add')}>Adicionar faixa</Button>
                  ) : (
                    <span className="wb-text-caption">Máximo de 5 faixas</span>
                  )}
                  {bands.length > 1 ? <Button variant="text" size="sm" onClick={() => setBands((current) => current.slice(0, -1))} data-testid={T('band-remove')}>Remover a última faixa</Button> : null}
                </div>
              </div>
            )}
            <TextField label="Pedido mínimo (opcional)" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} error={errors.minOrder} data-testid={T('min-order-input')} />
            <TextField label="Entrega grátis a partir de (opcional)" inputMode="decimal" value={freeAbove} onChange={(e) => setFreeAbove(e.target.value)} error={errors.freeAbove} data-testid={T('free-above-input')} />
            <div className={ui.stack}>
              <div className={ui.row} style={{ alignItems: 'flex-end' }}>
                <TextField label="Tempo estimado, de (min)" inputMode="numeric" value={etaMin} onChange={(e) => setEtaMin(e.target.value)} data-testid={T('eta-min-input')} />
                <TextField label="até (min)" inputMode="numeric" value={etaMax} onChange={(e) => setEtaMax(e.target.value)} data-testid={T('eta-max-input')} />
                <span className="wb-text-body-strong" aria-live="polite" style={{ paddingBottom: 12 }}>{etaText}</span>
              </div>
              {errors.eta ? <p role="alert" className="wb-text-caption" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>{errors.eta}</p> : null}
            </div>
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
