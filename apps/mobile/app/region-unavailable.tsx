import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchRegions } from '../src/api/auth-api';
import { Button } from '../src/components/Button';
import { Header } from '../src/components/Header';
import { MapPin } from '../src/components/icons';
import { Screen } from '../src/components/Screen';
import { EmptyState } from '../src/components/StateViews';
import { useToast } from '../src/components/Toast';
import { addressStore } from '../src/features/address/store';
import { t } from '../src/i18n';

/**
 * D4. Região não atendida (WB-004). Versão mínima: explica, oferece uma cidade atendida e a troca de endereço.
 * "Avisar quando chegar" (lista de espera com consentimento, WB-004 C2) depende de endpoint que ainda não existe no contrato.
 */
export default function RegionUnavailableScreen() {
  const router = useRouter();
  const toast = useToast();
  const { place } = useLocalSearchParams<{ place?: string; city?: string }>();
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions, staleTime: 10 * 60_000 });
  const firstCity = regions.data?.data[0];

  return (
    <Screen header={<Header title={t('location.title')} />}>
      <EmptyState
        icon={MapPin}
        link={
          <>
            {firstCity ? (
              <Button
                label={t('location.seeCity', { city: firstCity.name })}
                onPress={() => {
                  void addressStore
                    .add({
                      nickname: null,
                      precision: 'approx',
                      cep: '',
                      street: '',
                      number: '',
                      noNumber: false,
                      complement: '',
                      district: '',
                      city: firstCity.name,
                      state: firstCity.state,
                      latitude: null,
                      longitude: null,
                    })
                    .then(() => {
                      toast.show(t('location.deliveringIn', { place: firstCity.name }));
                      router.replace('/');
                    });
                }}
                testID="region.see-other-city"
                variant="secondary"
              />
            ) : null}
            <Button label={t('location.changeAddress')} onPress={() => router.replace('/location')} testID="region.change-address" variant="text" />
          </>
        }
        testID="region.unavailable"
        text={t('location.outOfRegionText')}
        title={t('location.outOfRegionTitle', { place: place ?? '' })}
      />
    </Screen>
  );
}
