'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Banner, RadioCards, Switch, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, type EtaPreview, type StoreSettings } from '@/lib/api/store-settings';
import { formatCents } from '@/lib/format';
import l from './loja.module.css';
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

  return (
    <SettingsFrame
      screen="entrega"
      title="Entrega e retirada"
      dirty={dirty}
      busy={busy}
      submitLabel="Salvar entrega e retirada"
      onSubmit={() => void submit()}
      error={formError}
      aside={<PreviewCard storeId={storeId} enabled={delivery} online={online} prep={prep} savedPrep={d.prepMinutes} />}
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

const PRESET_KM = [2, 5, 8] as const;
const km1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Preparo do campo como a API quer (5 a 120, inteiro); fora disso a prévia usa o salvo. */
export function previewPrep(text: string): number | undefined {
  if (!/^\d{1,3}$/.test(text.trim())) return undefined;
  const n = Number(text);
  return n >= PREP_MIN && n <= PREP_MAX ? n : undefined;
}

/**
 * "Prévia para o cliente" (WB-257, spec `onda-7-paineis-v3.md` §2.2): a conta é a do servidor (`POST /delivery-preview`, a mesma do checkout), com o
 * preparo ainda não salvo do formulário. Sem geocodificador contratado (DEC-067) a API não aceita CEP: o lojista escolhe a distância.
 */
function PreviewCard({ storeId, enabled, online, prep, savedPrep }: { storeId: string; enabled: boolean; online: boolean; prep: string; savedPrep?: number }) {
  const [km, setKm] = useState('3');
  const [debounced, setDebounced] = useState({ km: '3', prep: previewPrep(prep) });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ km, prep: previewPrep(prep) }), 400);
    return () => clearTimeout(timer);
  }, [km, prep]);
  const kmN = Number(debounced.km.replace(',', '.'));
  const kmValid = debounced.km.trim() !== '' && Number.isFinite(kmN) && kmN >= 0 && kmN <= 100;
  const query = useQuery({
    queryKey: ['lojista', 'delivery-preview', storeId, debounced.km, debounced.prep ?? 'saved'],
    queryFn: ({ signal }) => settingsApi.deliveryPreview(storeId, { distanceKm: kmN, ...(debounced.prep ? { prepMin: debounced.prep } : {}) }, signal),
    enabled: enabled && online && kmValid,
    staleTime: 30_000,
    retry: false,
  });
  const r = query.data;
  const typedPrep = previewPrep(prep);
  return (
    <div className={ui.stack} data-testid={T('preview-card')}>
      <h2 className="wb-text-title2" style={{ margin: 0 }}>Prévia para o cliente</h2>
      {!enabled ? (
        <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('preview-off')}>Ligue a entrega pela Webag para ver o horário que o cliente recebe.</p>
      ) : (
        <>
          <p className="wb-text-caption" style={{ margin: 0 }}>Usa o preparo que está no campo, mesmo sem salvar. Escolha a distância até o cliente.</p>
          <TextField label="Distância até o cliente (km)" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d,.]/g, '').slice(0, 5))} error={kmValid ? undefined : 'Digite de 0 a 100 km.'} data-testid={T('preview-km')} />
          <div className={l.chips} role="group" aria-label="Distâncias de teste">
            {PRESET_KM.map((value) => (
              <button key={value} type="button" className={`${l.chip} wb-text-body-strong`} aria-pressed={km === String(value)} onClick={() => setKm(String(value))} data-testid={T(`preview-km-${value}`)}>{value} km</button>
            ))}
          </div>
          {!online ? <p className="wb-text-caption" style={{ margin: 0 }}>Conecte-se para ver a prévia.</p> : null}
          <div aria-live="polite" className={ui.stack} data-testid={T('preview-result')}>
            {query.isFetching && !r ? <p className="wb-text-caption" style={{ margin: 0 }}>Calculando…</p> : null}
            {query.isError ? <Banner tone="warning" testId={T('preview-error')}>Não foi possível calcular agora. Tente de novo em instantes.</Banner> : null}
            {r ? <PreviewResult r={r} km={kmN} /> : null}
          </div>
        </>
      )}
      {r && enabled ? (
        <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('preview-reach')}>
          Com {r.prepMin} min de preparo{typedPrep === undefined && savedPrep ? ' (o salvo)' : ''}, a loja alcança até {km1(r.reachKm)} km.
        </p>
      ) : null}
      {r && enabled && typedPrep !== undefined && typedPrep > r.maxPrepMin ? (
        <Banner tone="warning" testId={T('preview-max-prep')}>Com {typedPrep} min de preparo a loja não alcança nenhum endereço. O maior preparo que ainda entrega é {r.maxPrepMin} min.</Banner>
      ) : null}
    </div>
  );
}

function PreviewResult({ r, km }: { r: EtaPreview; km: number }) {
  if (!r.available || !r.eta) {
    return r.reason === 'NO_FEE_TABLE' ? (
      <Banner tone="warning" testId={T('preview-nofee')}>Ainda não há taxa de entrega cadastrada para essa distância. Fale com o suporte da Webag.</Banner>
    ) : (
      <Banner tone="warning" testId={T('preview-out')}>
        <strong>Fora da área de entrega da loja.</strong> {km1(km)} km fica longe demais para o pedido chegar no prazo. A loja não aparece para quem mora lá; a retirada continua.
      </Banner>
    );
  }
  const e = r.eta;
  return (
    <div className={l.previewBox}>
      <p className={cx('wb-text-title2', l.previewHeadline)} data-testid={T('preview-band')}>Chega em {e.fromMin} a {e.toMin} min</p>
      <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('preview-sum')}>
        {r.fee ? (r.fee.amount === 0 ? 'O cliente não paga entrega. ' : `O cliente paga ${formatCents(r.fee.amount)} de entrega. `) : ''}
        Conta: preparo {e.prepMin} + espera do motoboy {e.dispatchMin} + trajeto {e.travelMin} min, com folga de {e.bandMin} para mais e para menos.
      </p>
    </div>
  );
}
