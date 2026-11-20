import type { CheckoutChange } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import { describeChange } from './errors';

export interface ChangedSheetProps {
  visible: boolean;
  changes: CheckoutChange[];
  /** Novo total (centavos) que o servidor calculou; vazio se ainda não veio. */
  totalCents: number | null;
  accepting: boolean;
  onAccept: () => void;
  onBack: () => void;
}

/**
 * "Algo mudou na sua sacola" (spec S3, RN-05): lista o que mudou e o novo total. Nada é cobrado sem o cliente ver o valor,
 * por isso "Aceitar" só atualiza a sacola: quem toca em "Pagar" de novo é o cliente.
 */
export function ChangedSheet({ visible, changes, totalCents, accepting, onAccept, onBack }: ChangedSheetProps) {
  return (
    <BottomSheet
      footer={
        <>
          <Button label={t('checkout.changedAccept')} loading={accepting} loadingLabel={t('common.loading')} onPress={onAccept} size="lg" testID="checkout.changed-accept" />
          <Button label={t('checkout.changedBack')} onPress={onBack} testID="checkout.changed-back" variant="secondary" />
        </>
      }
      hideClose
      onClose={onBack}
      testID="checkout.changed-sheet"
      title={t('checkout.changedTitle')}
      visible={visible}
    >
      <Text color="secondary">{t('checkout.changedText')}</Text>
      <View style={styles.list}>
        {changes.map((change, i) => (
          <Text key={`${change.variantId}-${change.kind}-${i}`}>{describeChange(change, formatMoney)}</Text>
        ))}
      </View>
      {totalCents !== null ? (
        <Text accessibilityLiveRegion="polite" variant="title2">
          {t('checkout.changedNewTotal', { total: formatMoney(totalCents) })}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.space[2] },
});
