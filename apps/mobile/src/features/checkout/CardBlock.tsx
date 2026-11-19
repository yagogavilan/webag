import { StyleSheet, View } from 'react-native';
import { Banner } from '../../components/Banner';
import { RadioListItem } from '../../components/RadioListItem';
import { Text } from '../../components/Text';
import { t, type MessageKey } from '../../i18n';
import { theme } from '../../theme';

/**
 * Cartão (S4). O app NUNCA lê nem guarda número de cartão (MASVS, SEC-037): só um token de uso único do provedor.
 * `fake` (dev e staging): o cartão é escolhido numa lista de cartões de TESTE e o token é de mentira (`fake_tok_*`, API fake).
 * `mercadopago`: o formulário seguro do Mercado Pago roda numa página nossa em WebView (ADR-002, pendência de contrato nº 9);
 * enquanto ela não existir o cartão fica indisponível e o cliente paga com PIX.
 */
export interface TestCard {
  token: string;
  title: MessageKey;
  hint: MessageKey;
}

export const TEST_CARDS: readonly TestCard[] = [
  { token: 'fake_tok_approved', title: 'card.testApproved', hint: 'card.testApprovedHint' },
  { token: 'fake_tok_insufficient', title: 'card.testInsufficient', hint: 'card.testInsufficientHint' },
  { token: 'fake_tok_3ds', title: 'card.test3ds', hint: 'card.test3dsHint' },
  { token: 'fake_tok_timeout', title: 'card.testTimeout', hint: 'card.testTimeoutHint' },
];

export const MAX_INSTALLMENTS = 3;

export interface CardBlockProps {
  token: string | null;
  installments: number;
  onToken: (token: string) => void;
  onInstallments: (n: number) => void;
  error?: string | null;
}

export function CardBlock({ token, installments, onToken, onInstallments, error }: CardBlockProps) {
  return (
    <View style={styles.block} testID="checkout.card-form">
      <Text color="secondary" variant="caption">{t('card.secure')}</Text>
      <Text accessibilityRole="header" variant="bodyStrong">{t('card.testTitle')}</Text>
      <Text color="secondary" variant="caption">{t('card.testHelp')}</Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {TEST_CARDS.map((card) => (
          <RadioListItem key={card.token} onPress={() => onToken(card.token)} selected={token === card.token} subtitle={t(card.hint)} testID={`card.test-${card.token}`} title={t(card.title)} />
        ))}
      </View>
      <Text accessibilityRole="header" variant="bodyStrong">{t('card.installments')}</Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
          <RadioListItem key={n} onPress={() => onInstallments(n)} selected={installments === n} testID={`card.installment-${n}`} title={n === 1 ? t('card.installmentSingle') : t('card.installmentMany', { n })} />
        ))}
      </View>
      <Text color="secondary" variant="caption">{t('card.installmentNote')}</Text>
      {error ? <Banner text={error} tone="danger" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ block: { gap: theme.space[2] }, group: { gap: theme.space[2] } });
