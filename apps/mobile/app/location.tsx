import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { fetchRegions } from '../src/api/auth-api';
import { AsyncBoundary } from '../src/components/AsyncBoundary';
import { Button } from '../src/components/Button';
import { Header } from '../src/components/Header';
import { Crosshair, MapPin } from '../src/components/icons';
import { RadioListItem } from '../src/components/RadioListItem';
import { Screen } from '../src/components/Screen';
import { Skeleton } from '../src/components/Skeleton';
import { ErrorState } from '../src/components/StateViews';
import { Text } from '../src/components/Text';
import { useToast } from '../src/components/Toast';
import { findActiveCity } from '../src/features/address/regions';
import { locateApproximately } from '../src/features/address/location';
import { addressStore } from '../src/features/address/store';
import { t } from '../src/i18n';
import { haptic } from '../src/lib/haptics';
import { useOnline } from '../src/lib/useOnline';
import { theme } from '../src/theme';

type Phase = 'idle' | 'searching' | 'denied' | 'failed' | 'offline' | 'cities';

/**
 * D1. Onde você quer receber? (WB-001). A própria tela explica o motivo ANTES do pedido do sistema (design-system.md §5.6).
 * Três caminhos sem login: localização, CEP ou cidade. Localização aproximada basta.
 */
export default function LocationScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  // "o app lembra a escolha e não pede de novo no mesmo uso"
  const deniedThisSession = useRef(false);

  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions, enabled: phase === 'cities', staleTime: 10 * 60_000 });

  const deliver = async (place: { city: string; district: string; state: string; latitude?: number; longitude?: number }) => {
    // Região ativa = cidade ativa. Sem rede para conferir, segue: a cotação de frete valida de novo no servidor.
    try {
      const data = await queryClient.fetchQuery({ queryKey: ['regions'], queryFn: fetchRegions, staleTime: 10 * 60_000 });
      if (!findActiveCity(data.data, place.city)) {
        router.replace({ pathname: '/region-unavailable', params: { place: place.district || place.city, city: place.city } });
        return;
      }
    } catch {
      // fail-open
    }
    await addressStore.add({
      nickname: null,
      precision: 'approx',
      cep: '',
      street: '',
      number: '',
      noNumber: false,
      complement: '',
      district: place.district,
      city: place.city,
      state: place.state || 'SP',
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
    });
    void haptic('success');
    toast.show(t('location.deliveringIn', { place: place.district || place.city }));
    router.replace('/');
  };

  const startGps = async () => {
    if (!online) {
      setPhase('offline');
      return;
    }
    if (deniedThisSession.current) {
      setPhase('denied');
      return;
    }
    setPhase('searching');
    const outcome = await locateApproximately();
    if (outcome.kind === 'ok') {
      await deliver(outcome.place);
      return;
    }
    void haptic('warning');
    if (outcome.kind === 'denied' || outcome.kind === 'blocked') {
      deniedThisSession.current = true;
      setPhase('denied');
    } else {
      setPhase('failed');
    }
  };

  if (phase === 'cities') {
    return (
      <Screen header={<Header onBack={() => setPhase('idle')} title={t('location.cityTitle')} />}>
        <AsyncBoundary
          isError={regions.isError}
          isLoading={regions.isLoading}
          onRetry={() => void regions.refetch()}
          skeleton={
            <View style={styles.list}>
              {[0, 1, 2].map((i) => (
                <Skeleton height={72} key={i} />
              ))}
            </View>
          }
        >
          <View style={styles.list}>
            {regions.data?.data.map((city) => (
              <RadioListItem
                key={city.id}
                onPress={() => void deliver({ city: city.name, district: '', state: city.state })}
                selected={false}
                subtitle={city.state}
                testID={`location.city-${city.id}`}
                title={city.name}
              />
            ))}
          </View>
        </AsyncBoundary>
      </Screen>
    );
  }

  const blockedPhase = phase === 'denied' || phase === 'failed';
  const title =
    phase === 'denied' ? t('location.deniedTitle') : phase === 'failed' ? t('location.gpsFailed') : t('location.title');

  const footer = (
    <>
      {blockedPhase ? (
        <Button label={t('location.enterCep')} onPress={() => router.push('/address/form')} size="lg" testID="location.enter-cep" />
      ) : (
        <Button
          icon={<Crosshair color={theme.color.text.onBrand} size={theme.size.iconSm} />}
          label={t('location.useGps')}
          loading={phase === 'searching'}
          loadingLabel={t('location.searching')}
          onPress={() => void startGps()}
          size="lg"
          testID="location.use-gps"
        />
      )}
      {!blockedPhase ? <Button label={t('location.enterCep')} onPress={() => router.push('/address/form')} testID="location.enter-cep" variant="secondary" /> : null}
      {phase === 'denied' ? <Button label={t('location.openSettings')} onPress={() => void Linking.openSettings()} testID="location.open-settings" variant="text" /> : null}
      <Button label={t('location.chooseCity')} onPress={() => setPhase('cities')} testID="location.choose-city" variant="text" />
    </>
  );

  return (
    <Screen footer={footer} scroll={false}>
      {phase === 'offline' ? (
        <View style={styles.center}>
          <ErrorState offline onRetry={() => void startGps()} retryLabel={t('common.tryAgain')} testID="location.retry" text={t('location.offlineText')} title={t('location.offlineTitle')} />
        </View>
      ) : (
        <View style={styles.center}>
          <View style={styles.circle}>
            <MapPin color={theme.color.text.brand} size={theme.size.iconEmpty} weight="duotone" />
          </View>
          <Text style={styles.centerText} variant="title1">
            {title}
          </Text>
          {phase === 'idle' || phase === 'searching' ? (
            <Text color="secondary" style={styles.centerText}>
              {t('location.text')}
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[4] },
  circle: { width: 120, height: 120, borderRadius: theme.radius.full, backgroundColor: theme.color.surface.sunken, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  list: { gap: theme.space[3] },
});
