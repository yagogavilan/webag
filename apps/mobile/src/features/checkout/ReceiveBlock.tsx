import { Pressable, StyleSheet, View } from 'react-native';
import { MapPin, Storefront } from '../../components/icons';
import { Segmented } from '../../components/Segmented';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { addressArea, addressLine, type Address } from '../address/types';
import { formatEta } from '../catalog/format';
import type { ReceiveMode } from './state';

export interface ReceiveBlockProps {
  mode: ReceiveMode;
  onModeChange: (mode: ReceiveMode) => void;
  address: Address | null;
  ready: boolean;
  etaMin: number | null;
  etaMax: number | null;
  onChangeAddress: () => void;
}

/** Bloco "Como você quer receber?" (spec S3, 1): Entrega | Retirada, endereço com "Trocar", previsão sem prometer horário. */
export function ReceiveBlock({ mode, onModeChange, address, ready, etaMin, etaMax, onChangeAddress }: ReceiveBlockProps) {
  const eta = etaMin !== null && etaMax !== null ? formatEta(etaMin, etaMax) : null;
  return (
    <View style={styles.block} testID="checkout.receive">
      <Text accessibilityRole="header" variant="title2">
        {t('checkout.receive')}
      </Text>
      <Segmented
        label={t('checkout.receiveGroup')}
        onChange={onModeChange}
        options={[
          { value: 'delivery', label: t('checkout.delivery'), testID: 'checkout.mode-delivery' },
          { value: 'pickup', label: t('checkout.pickup'), testID: 'checkout.mode-pickup' },
        ]}
        value={mode}
      />
      {mode === 'delivery' ? (
        <View style={styles.row} testID="checkout.address">
          <MapPin color={theme.color.text.brand} size={theme.size.iconMd} />
          <View style={styles.texts}>
            <Text variant="bodyStrong">{address && ready ? addressLine(address) : t('checkout.noAddress')}</Text>
            {address ? (
              <Text color="secondary" variant="caption">
                {addressArea(address)}
              </Text>
            ) : null}
            {ready && eta ? (
              <Text color="secondary" variant="caption">
                {t('checkout.arrives', { eta })}
              </Text>
            ) : null}
          </View>
          <Pressable accessibilityLabel={t('checkout.change')} accessibilityRole="button" onPress={onChangeAddress} style={styles.action} testID="checkout.address-change">
            <Text color="link" variant="label">
              {t('checkout.change')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pickup} testID="checkout.pickup-info">
          <View style={styles.row}>
            <Storefront color={theme.color.text.brand} size={theme.size.iconMd} />
            <View style={styles.texts}>
              <Text variant="bodyStrong">{t('checkout.pickup')}</Text>
              <Text color="secondary" variant="caption">
                {t('checkout.pickupCode')}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: 56 },
  texts: { flex: 1 },
  action: { minWidth: theme.size.touchMin, minHeight: theme.size.touchMin, alignItems: 'center', justifyContent: 'center' },
  pickup: { gap: theme.space[2] },
});
