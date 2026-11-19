import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BarsLoader } from '../../src/art/Bars';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Lock } from '../../src/components/icons';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { cardIntentMemory, useCardIntentWatcher } from '../../src/features/checkout/card-intent';
import { openExternal } from '../../src/features/legal/open-link';
import { t } from '../../src/i18n';
import { theme } from '../../src/theme';

/**
 * Espera do cartão na página segura. O app não vê o cartão nem confirma o pagamento: só mostra o que o servidor diz. Quando o
 * pedido aparece, segue para o acompanhamento (que lê o status do servidor). A intenção vence em 15 min.
 */
export default function CardWaitScreen() {
  const router = useRouter();
  const intent = cardIntentMemory.get();
  const { expired } = useCardIntentWatcher(intent, (orderId) => {
    cardIntentMemory.set(null);
    router.replace({ pathname: '/pay/[orderId]', params: { orderId } } as never);
  });

  const reopen = () => {
    if (intent) void openExternal(intent.url, 'card');
  };

  return (
    <Screen header={<Header title={t('cardWait.title')} />} testID="card-wait.screen">
      {!intent || expired ? (
        <View style={styles.box} testID="card-wait.expired">
          <Text variant="title1">{t('cardWait.expiredTitle')}</Text>
          <Text color="secondary">{t('cardWait.expiredText')}</Text>
          <Button label={t('cardWait.backToCheckout')} onPress={() => router.replace('/checkout')} size="lg" testID="card-wait.back" />
        </View>
      ) : (
        <View style={styles.box}>
          <Lock color={theme.color.action.primary} duo={theme.color.brand[300]} size={56} weight="duotone" />
          <Text variant="poster">{t('cardWait.headline')}</Text>
          <Text color="secondary">{t('cardWait.text')}</Text>
          <View accessibilityLiveRegion="polite" style={styles.waiting}>
            <BarsLoader accessibilityLabel={t('cardWait.waiting')} />
            <Text variant="bodyStrong">{t('cardWait.waiting')}</Text>
          </View>
          <Button label={t('cardWait.reopen')} onPress={reopen} size="lg" testID="card-wait.reopen" />
          <Button label={t('cardWait.cancel')} onPress={() => router.replace('/cart')} testID="card-wait.cancel" variant="text" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { gap: theme.space[4], paddingTop: theme.space[6] },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3] },
});
