import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { fetchRegions } from '../../src/api/auth-api';
import { useSession } from '../../src/api/session';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Checkbox } from '../../src/components/Checkbox';
import { Chips } from '../../src/components/Chips';
import { Header } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { TextField } from '../../src/components/TextField';
import { useToast } from '../../src/components/Toast';
import { lookupCep } from '../../src/features/address/cep';
import { geocodeAddress } from '../../src/features/address/location';
import { findActiveCity } from '../../src/features/address/regions';
import { addressSchema, type AddressForm } from '../../src/features/address/schemas';
import { addressStore, useAddresses } from '../../src/features/address/store';
import { addressLine, MAX_ADDRESSES } from '../../src/features/address/types';
import { t } from '../../src/i18n';
import { haptic } from '../../src/lib/haptics';
import { maskCep, onlyDigits } from '../../src/lib/masks';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

type Lookup = 'idle' | 'loading' | 'found' | 'not-found';

/** D2. Endereço por CEP (WB-002): digitou 8 números, o app preenche rua, bairro e cidade e leva o foco ao Número. */
export default function AddressFormScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const session = useSession();
  const saved = useAddresses();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const editing = saved.status === 'ready' ? saved.addresses.find((a) => a.id === id) : undefined;
  const loggedIn = session.status === 'authenticated';

  const [lookup, setLookup] = useState<Lookup>('idle');
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stateRef = useRef(editing?.state ?? 'SP');
  const lookupSeq = useRef(0);

  const { control, handleSubmit, setValue, setFocus, setError, clearErrors } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    mode: 'onTouched',
    defaultValues: {
      cep: editing ? maskCep(editing.cep) : '',
      street: editing?.street ?? '',
      number: editing?.number ?? '',
      noNumber: editing?.noNumber ?? false,
      complement: editing?.complement ?? '',
      district: editing?.district ?? '',
      city: editing?.city ?? '',
      nickname: editing?.nickname ?? null,
    },
  });
  const noNumber = useWatch({ control, name: 'noNumber' });
  const complement = useWatch({ control, name: 'complement' });

  // foco no CEP ao abrir (cadastro novo) é do autoFocus do campo

  const search = async (masked: string) => {
    if (onlyDigits(masked).length !== 8) {
      setLookup('idle');
      return;
    }
    if (!online) {
      setLookup('idle');
      setError('cep', { type: 'manual', message: t('address.offlineManual') });
      return;
    }
    const seq = ++lookupSeq.current;
    setLookup('loading');
    clearErrors('cep');
    const result = await lookupCep(masked);
    if (seq !== lookupSeq.current) return; // o usuário já mudou o CEP
    if (result.kind === 'found') {
      setValue('street', result.value.street, { shouldValidate: false });
      setValue('district', result.value.district, { shouldValidate: false });
      setValue('city', result.value.city, { shouldValidate: false });
      stateRef.current = result.value.state;
      setLookup('found');
      void haptic('light');
    } else {
      // CEP inexistente ou serviço fora do ar: mesma mensagem, campos liberados
      setLookup('not-found');
      setError('cep', { type: 'manual', message: t('address.cepNotFound') });
    }
  };

  // depois que os campos voltam do skeleton, o foco vai ao Número
  useEffect(() => {
    if (lookup === 'found') setFocus('number');
    if (lookup === 'not-found') setFocus('street');
  }, [lookup, setFocus]);

  const submit = handleSubmit(
    async (values) => {
      setBanner(null);
      if (!online) {
        setBanner(t('address.offlineSave'));
        return;
      }
      setSaving(true);
      try {
        // WB-002 C5: cidade inativa não vira endereço de entrega
        try {
          const regions = await fetchRegions();
          if (!findActiveCity(regions.data, values.city)) {
            router.replace({ pathname: '/region-unavailable', params: { place: values.district || values.city, city: values.city } });
            return;
          }
        } catch {
          // sem conferir a região (API fora do ar): segue; o servidor valida na cotação
        }
        const number = values.noNumber ? '' : values.number.trim();
        const point = await geocodeAddress(
          `${values.street}, ${number || 's/n'}, ${values.district}, ${values.city} - ${stateRef.current}, Brasil`,
        );
        const fields = {
          nickname: loggedIn ? values.nickname : null,
          precision: 'full' as const,
          cep: onlyDigits(values.cep),
          street: values.street.trim(),
          number,
          noNumber: values.noNumber,
          complement: values.complement.trim(),
          district: values.district.trim(),
          city: values.city.trim(),
          state: stateRef.current,
          latitude: point?.latitude ?? null,
          longitude: point?.longitude ?? null,
        };
        let address;
        if (editing) {
          await addressStore.update(editing.id, fields);
          await addressStore.setCurrent(editing.id);
          address = { ...editing, ...fields };
        } else {
          address = await addressStore.add(fields);
          if (!address) {
            setBanner(t('address.limit'));
            return;
          }
        }
        void haptic('success');
        toast.show(loggedIn ? t('address.saved') : t('address.deliveringTo', { place: addressLine(address) }));
        if (from === 'addresses' && router.canGoBack()) router.back();
        else router.replace('/');
      } finally {
        setSaving(false);
      }
    },
    () => void haptic('error'),
  );

  const loading = lookup === 'loading';
  const atLimit = !editing && saved.status === 'ready' && saved.addresses.filter((a) => a.precision === 'full').length >= MAX_ADDRESSES;

  return (
    <Screen
      footer={
        <Button
          label={loggedIn ? t('address.save') : t('address.useThis')}
          loading={saving}
          onPress={() => void submit()}
          size="lg"
          testID="address.submit"
        />
      }
      header={<Header title={t('address.title')} />}
    >
      <Controller
        control={control}
        name="cep"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="postal-code"
            autoFocus={!editing}
            error={fieldState.error?.message}
            help={loading ? t('address.searching') : undefined}
            keyboardType="number-pad"
            label={t('address.cep')}
            mask={maskCep}
            maxLength={9}
            onBlur={field.onBlur}
            onChangeText={(v) => {
              field.onChange(v);
              void search(v);
            }}
            ref={field.ref}
            returnKeyType="next"
            testID="address.cep-input"
            textContentType="postalCode"
            value={field.value}
          />
        )}
      />

      {loading ? (
        <View accessibilityLabel={t('address.searching')} style={styles.skeletons} testID="address.cep-skeleton">
          <Skeleton height={theme.size.controlLg} />
          <Skeleton height={theme.size.controlLg} />
          <Skeleton height={theme.size.controlLg} />
        </View>
      ) : (
        <>
          <Controller
            control={control}
            name="street"
            render={({ field, fieldState }) => (
              <TextField
                autoCapitalize="words"
                error={fieldState.error?.message}
                label={t('address.street')}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                onSubmitEditing={() => setFocus('number')}
                ref={field.ref}
                returnKeyType="next"
                testID="address.street-input"
                textContentType="streetAddressLine1"
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="district"
            render={({ field, fieldState }) => (
              <TextField
                autoCapitalize="words"
                error={fieldState.error?.message}
                label={t('address.district')}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                ref={field.ref}
                returnKeyType="next"
                testID="address.district-input"
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="city"
            render={({ field, fieldState }) => (
              <TextField
                autoCapitalize="words"
                error={fieldState.error?.message}
                label={t('address.city')}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                ref={field.ref}
                returnKeyType="next"
                testID="address.city-input"
                textContentType="addressCity"
                value={field.value}
              />
            )}
          />
        </>
      )}

      <Controller
        control={control}
        name="number"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="characters"
            editable={!noNumber}
            error={noNumber ? undefined : fieldState.error?.message}
            label={t('address.number')}
            maxLength={10}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => setFocus('complement')}
            ref={field.ref}
            returnKeyType="next"
            testID="address.number-input"
            value={noNumber ? '' : field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="noNumber"
        render={({ field }) => (
          <Checkbox
            checked={field.value}
            label={t('address.noNumber')}
            onChange={(v) => {
              field.onChange(v);
              if (v) {
                setValue('number', '');
                clearErrors('number');
              }
            }}
            testID="address.no-number"
          />
        )}
      />

      <Controller
        control={control}
        name="complement"
        render={({ field, fieldState }) => (
          <TextField
            error={fieldState.error?.message}
            help={`${complement.length}/80`}
            label={t('address.complement')}
            maxLength={80}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            ref={field.ref}
            returnKeyType="done"
            testID="address.complement-input"
            value={field.value}
          />
        )}
      />

      {loggedIn ? (
        <Controller
          control={control}
          name="nickname"
          render={({ field }) => (
            <Chips
              label={t('address.nickname')}
              onChange={field.onChange}
              options={[
                { value: 'home', label: t('address.home'), testID: 'address.nickname-home' },
                { value: 'work', label: t('address.work'), testID: 'address.nickname-work' },
                { value: 'other', label: t('address.other'), testID: 'address.nickname-other' },
              ]}
              value={field.value}
            />
          )}
        />
      ) : null}

      {atLimit ? <Banner testID="addresses.limit-message" text={t('address.limit')} tone="warning" /> : null}
      {banner ? <Banner testID="address.error" text={banner} tone="danger" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeletons: { gap: theme.space[4] },
});
