'use client';

import type { CategoryTree, PublicRegionList } from '@webag/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, CheckboxField, SelectField, Skeleton, TextField, ui } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { merchantApi, type MerchantStore, type StoreAddress } from '@/lib/api/lojista';
import { isServedCity } from '@/lib/br/city';
import { isValidEmail, isValidPhone, maskCep, maskPhone, onlyDigits } from '@/lib/br/mask';
import { ltid } from '@/lib/testid';
import { useMerchant } from '../store-context';
import { SaveError, StepFrame } from './step-frame';
import { draftErrorMessage, useSaveDraft } from './use-draft';

interface Props {
  store: MerchantStore | null;
  next: string;
  backHref?: string | undefined;
}

const EMPTY: StoreAddress = { cep: '', street: '', number: '', noNumber: false, complement: '', neighborhood: '', city: '', state: '', lat: null, lng: null };

type Errors = Partial<Record<'name' | 'category' | 'whatsapp' | 'cep' | 'street' | 'number' | 'city', string>>;

/** L4, Etapa 2 de 4: nome, categoria, WhatsApp e endereço por CEP (autocompletar, cidade fora das regiões ativas). */
export function Step2({ store, next, backHref }: Props) {
  const router = useRouter();
  const { user } = useMerchant();
  const save = useSaveDraft();
  const root = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(store?.name ?? '');
  const [categoryId, setCategoryId] = useState(store?.categoryId ?? '');
  const [whatsapp, setWhatsapp] = useState(store?.whatsapp ? maskPhone(store.whatsapp) : '');
  const [address, setAddress] = useState<StoreAddress>(store?.address ?? EMPTY);
  const [cepState, setCepState] = useState<'idle' | 'loading' | 'found' | 'notfound' | 'offline'>(store?.address?.street ? 'found' : 'idle');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const categories = useQuery({ queryKey: ['lojista', 'categories'], queryFn: () => apiRequest<CategoryTree>('lojista', 'categories'), staleTime: 5 * 60_000 });
  const regions = useQuery({ queryKey: ['lojista', 'regions'], queryFn: () => apiRequest<PublicRegionList>('lojista', 'regions'), staleTime: 5 * 60_000 });

  const served = regions.data && address.city ? isServedCity(regions.data.data, address.city, address.state) : true;

  // CEP completo (8 dígitos): preenche rua, bairro e cidade.
  useEffect(() => {
    const digits = onlyDigits(address.cep);
    if (digits.length !== 8 || cepState !== 'loading') return;
    let alive = true;
    merchantApi
      .cep(digits)
      .then((found) => {
        if (!alive) return;
        setAddress((current) => ({ ...current, street: found.street, neighborhood: found.neighborhood, city: found.city, state: found.state, lat: found.lat, lng: found.lng }));
        setCepState('found');
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setCepState(caught instanceof ApiError && caught.isNetwork ? 'offline' : 'notfound');
      });
    return () => {
      alive = false;
    };
  }, [address.cep, cepState]);

  function patch(change: Partial<StoreAddress>) {
    setAddress((current) => ({ ...current, ...change }));
  }

  function onCep(value: string) {
    const masked = maskCep(value);
    setCepState(onlyDigits(masked).length === 8 ? 'loading' : 'idle');
    setAddress({ ...EMPTY, number: address.number, noNumber: address.noNumber, complement: address.complement, cep: masked });
  }

  const manual = cepState === 'notfound' || cepState === 'offline';
  const categoryOptions = (categories.data?.data ?? []).filter((category) => category.active);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const next_: Errors = {};
    if (name.trim().length < 2) next_.name = 'Digite o nome da loja.';
    if (!categoryId) next_.category = 'Escolha a categoria principal.';
    if (!isValidPhone(whatsapp)) next_.whatsapp = 'Confira o WhatsApp com DDD.';
    if (onlyDigits(address.cep).length !== 8) next_.cep = 'Confira o CEP.';
    else if (!address.street.trim() || !address.city.trim()) next_.street = 'Preencha a rua e a cidade.';
    if (!address.noNumber && !address.number.trim()) next_.number = 'Digite o número ou marque "Sem número".';
    if (address.city && !served) next_.city = `Ainda não atendemos ${address.city}.`;
    setErrors(next_);
    if (Object.keys(next_).length > 0) {
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    try {
      await save.mutateAsync({ step: Math.max(store?.step ?? 0, 2), name: name.trim(), categoryId, whatsapp: onlyDigits(whatsapp), address: { ...address, number: address.noNumber ? '' : address.number.trim() } });
      router.push(next as never);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'CITY_NOT_SERVED') return setErrors({ city: `Ainda não atendemos ${address.city}.` });
      setFormError(draftErrorMessage(caught));
    }
  }

  return (
    <StepFrame step={2} screen="etapa2" title="Sobre a sua loja" savedAt={store?.updatedAt && store.step >= 2 ? store.updatedAt : null} backHref={backHref} submitLabel="Continuar" busy={save.isPending} onSubmit={submit} error={formError ? <SaveError message={formError} /> : null}>
      <div ref={root} className={ui.stack}>
        <TextField label="Nome da loja" value={name} maxLength={60} counter={{ value: name.length, max: 60 }} onChange={(e) => setName(e.target.value)} autoComplete="organization" error={errors.name} data-testid={ltid('etapa2', 'name-input')} />

        {categories.isError ? (
          <div className={ui.stack} data-testid={ltid('etapa2', 'category-error')}>
            <Banner tone="danger" action={<Button variant="secondary" size="sm" onClick={() => void categories.refetch()}>Tentar de novo</Button>}>
              Não conseguimos carregar as categorias.
            </Banner>
          </div>
        ) : categories.isPending ? (
          <Skeleton height={48} label="Carregando as categorias" />
        ) : (
          <SelectField label="Categoria principal" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.category} data-testid={ltid('etapa2', 'category-select')}>
            <option value="">Escolha uma categoria</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
        )}

        <TextField label="WhatsApp da loja" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} placeholder="(00) 00000-0000" hint="É o número que o cliente usa para falar com você." autoComplete="tel" error={errors.whatsapp} data-testid={ltid('etapa2', 'whatsapp-input')} />

        <TextField
          label="CEP da loja"
          inputMode="numeric"
          value={address.cep}
          onChange={(e) => onCep(e.target.value)}
          autoComplete="postal-code"
          placeholder="00000-000"
          error={errors.cep}
          hint={cepState === 'loading' ? 'Buscando CEP…' : cepState === 'notfound' ? 'Não achamos esse CEP. Preencha rua e bairro.' : cepState === 'offline' ? 'Sem conexão. Preencha rua e bairro à mão.' : undefined}
          data-testid={ltid('etapa2', 'cep-input')}
        />
        {cepState === 'loading' ? (
          <div className={ui.stack} role="status" aria-label="Buscando o endereço">
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : cepState === 'found' || manual ? (
          <>
            <TextField label="Rua" value={address.street} onChange={(e) => patch({ street: e.target.value })} readOnly={cepState === 'found'} autoComplete="address-line1" error={errors.street} data-testid={ltid('etapa2', 'street-input')} />
            <TextField label="Bairro" value={address.neighborhood} onChange={(e) => patch({ neighborhood: e.target.value })} readOnly={cepState === 'found'} data-testid={ltid('etapa2', 'neighborhood-input')} />
            <TextField label="Cidade" value={address.city ? `${address.city}${address.state ? ` - ${address.state}` : ''}` : ''} onChange={(e) => patch({ city: e.target.value })} readOnly={cepState === 'found'} error={errors.city} data-testid={ltid('etapa2', 'city-input')} />
          </>
        ) : null}

        {address.city && !served ? <OutOfRegion city={address.city} defaultEmail={user.email} /> : null}

        <div className={ui.stack}>
          <TextField label="Número" value={address.noNumber ? '' : address.number} disabled={address.noNumber} onChange={(e) => patch({ number: e.target.value })} inputMode="numeric" autoComplete="off" error={errors.number} data-testid={ltid('etapa2', 'number-input')} />
          <CheckboxField checked={address.noNumber} onChange={(e) => patch({ noNumber: e.target.checked, number: '' })} label="Sem número" data-testid={ltid('etapa2', 'no-number-checkbox')} />
        </div>
        <TextField label="Complemento (opcional)" value={address.complement} maxLength={80} onChange={(e) => patch({ complement: e.target.value })} autoComplete="address-line2" data-testid={ltid('etapa2', 'complement-input')} />

        {cepState === 'found' && (address.lat === null || address.lng === null) ? (
          <Banner tone="info" testId={ltid('etapa2', 'no-point')}>
            Não achamos o ponto exato no mapa. A equipe do Webag confere o endereço na análise.
          </Banner>
        ) : null}
      </div>
    </StepFrame>
  );
}

/** Cidade fora das regiões ativas (WB-051 C3): lista de espera só com o consentimento marcado e desmarcado por padrão. */
function OutOfRegion({ city, defaultEmail }: { city: string; defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    if (!isValidEmail(email)) return setError('Confira o e-mail.');
    if (!consent) return setError('Marque a caixa para continuar.');
    setBusy(true);
    try {
      await merchantApi.waitlist({ email: email.trim(), kind: 'city', city, consent: true });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.isNetwork ? 'Sem conexão. Conecte-se para continuar.' : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={ui.card} data-testid={ltid('etapa2', 'out-of-region')}>
      <div className={ui.stack}>
        <p className="wb-text-body-strong" style={{ margin: 0 }}>
          Ainda não atendemos {city}.
        </p>
        <p className="wb-text-body" style={{ margin: 0 }}>
          Deixe seu e-mail para avisarmos quando chegarmos.
        </p>
        {done ? (
          <Banner tone="success">Anotado. Avisamos por e-mail.</Banner>
        ) : (
          <>
            <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid={ltid('etapa2', 'waitlist-email-input')} />
            <CheckboxField checked={consent} onChange={(e) => setConsent(e.target.checked)} label="Quero receber um aviso por e-mail quando o Webag chegar em minha cidade." />
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <Button variant="secondary" loading={busy} loadingLabel="Salvando…" onClick={() => void send()} data-testid={ltid('etapa2', 'waitlist-submit')}>
              Avisar quando chegar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
