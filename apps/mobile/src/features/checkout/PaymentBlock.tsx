import { StyleSheet, View } from 'react-native';
import { RadioListItem } from '../../components/RadioListItem';
import { CreditCard, QrCode } from '../../components/icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import type { PayMethod } from './state';

export interface PaymentBlockProps {
  method: PayMethod;
  onMethodChange: (method: PayMethod) => void;
  cardAvailable: boolean;
  cardDisabledReason?: string | undefined;
  /** Formulário do cartão (S4), inline logo abaixo da opção. */
  cardForm?: React.ReactNode;
  /** Campo de CPF, só quando o provedor pediu. */
  cpfField?: React.ReactNode;
}

/** Bloco "Como você quer pagar?" (spec S3, 3): PIX (padrão) e cartão de crédito. */
export function PaymentBlock({ method, onMethodChange, cardAvailable, cardDisabledReason, cardForm, cpfField }: PaymentBlockProps) {
  return (
    <View style={styles.block} testID="checkout.payment">
      <Text accessibilityRole="header" variant="title2">
        {t('checkout.pay')}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        <RadioListItem
          accessibilityLabel={`${t('checkout.pix')}, ${t('checkout.pixHint').toLowerCase()}`}
          leading={<QrCode color={theme.color.text.brand} size={theme.size.iconMd} />}
          onPress={() => onMethodChange('pix')}
          selected={method === 'pix'}
          subtitle={t('checkout.pixHint')}
          testID="checkout.pay-pix"
          title={t('checkout.pix')}
        />
        {cardAvailable ? (
          <RadioListItem
            accessibilityLabel={`${t('checkout.card')}, ${t('checkout.cardHint').toLowerCase()}`}
            leading={<CreditCard color={theme.color.text.brand} size={theme.size.iconMd} />}
            onPress={() => onMethodChange('card')}
            selected={method === 'card'}
            subtitle={t('checkout.cardHint')}
            testID="checkout.pay-card"
            title={t('checkout.card')}
          />
        ) : cardDisabledReason ? (
          <Text color="secondary" testID="checkout.card-disabled" variant="caption">
            {cardDisabledReason}
          </Text>
        ) : null}
      </View>
      {method === 'card' ? cardForm : null}
      {cpfField}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.space[3] },
  group: { gap: theme.space[2] },
});
