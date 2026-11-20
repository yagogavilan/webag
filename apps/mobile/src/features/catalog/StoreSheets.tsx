import type { BrowseStore } from '@webag/shared';
import { View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';

interface SheetProps {
  store: BrowseStore;
  visible: boolean;
  onClose: () => void;
}

/**
 * Política de trocas (D8 C5): a troca voluntária é da loja; arrependimento e defeito são piso legal fixo.
 * [HIPÓTESE jurídica] os textos de direitos do consumidor precisam de validação antes do G5 (onda-3 §Z-4).
 */
export function ExchangePolicySheet({ store, visible, onClose }: SheetProps) {
  const { voluntaryDays, collectionFeeCents } = store.exchangePolicy;
  return (
    <BottomSheet onClose={onClose} testID="store.exchange-sheet" title={t('store.exchangePolicy')} visible={visible}>
      <View style={{ gap: theme.space[1] }}>
        <Text variant="bodyStrong">{t('store.exchangeYes')}</Text>
        <Text color="secondary">
          {voluntaryDays > 0
            ? collectionFeeCents > 0
              ? t('store.exchangeYesText', { days: voluntaryDays, fee: formatMoney(collectionFeeCents) })
              : t('store.exchangeYesFree', { days: voluntaryDays })
            : t('store.exchangeNo')}
        </Text>
      </View>
      <View style={{ gap: theme.space[1] }}>
        <Text variant="bodyStrong">{t('store.rightsTitle')}</Text>
        <Text color="secondary">{t('store.rightsRegret')}</Text>
        <Text color="secondary">{t('store.rightsDefect')}</Text>
      </View>
    </BottomSheet>
  );
}

/** Sobre a loja (D8 C6): quem vende (Decreto 7.962), documento mascarado, endereço e horário de hoje. */
export function AboutStoreSheet({ store, visible, onClose }: SheetProps) {
  const a = store.supplier.address;
  const address = [[a.street, a.number].filter(Boolean).join(', '), a.neighborhood, a.city].filter(Boolean).join(' · ');
  return (
    <BottomSheet onClose={onClose} testID="store.about-sheet" title={t('store.about')} visible={visible}>
      <Text variant="bodyStrong">{store.supplier.name}</Text>
      <View>
        <Text color="secondary" variant="caption">
          {t('store.aboutDocument')}
        </Text>
        <Text>{store.supplier.documentMasked}</Text>
      </View>
      {address ? (
        <View>
          <Text color="secondary" variant="caption">
            {t('store.aboutAddress')}
          </Text>
          <Text>{address}</Text>
        </View>
      ) : null}
      {store.hoursToday.length > 0 ? (
        <View>
          <Text color="secondary" variant="caption">
            {t('store.aboutHours')}
          </Text>
          <Text>{store.hoursToday.map((h) => `${h.start} às ${h.end}`).join(' e ')}</Text>
        </View>
      ) : null}
      <Text color="secondary">{t('store.aboutNotice')}</Text>
    </BottomSheet>
  );
}
