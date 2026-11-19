import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Bag } from '../../components/icons';
import { Money } from '../../components/Money';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { Pop, Pressy, useCountTo } from '../../motion';
import { theme } from '../../theme';
import { useCartView } from './hooks';

/**
 * Mini sacola fixa (direção v3): barra noite acima das abas com a loja, os itens e o total. O total rola ao mudar (só por ação do
 * usuário; ao abrir aparece direto) e o contador "pula" quando entra item. Some com a sacola vazia.
 */
export function MiniBag({ bottom = theme.space[2], testID = 'minibag' }: { bottom?: number; testID?: string }) {
  const router = useRouter();
  const { view } = useCartView();
  const total = useCountTo(view ? (view.summary?.totalCents ?? view.subtotalCents) : 0);
  if (!view || view.count === 0) return null;
  const noun = view.count === 1 ? t('cart.itemOne') : t('cart.itemMany');
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Pressy
        accessibilityLabel={t('minibag.a11y', { store: view.storeName, count: view.count, noun })}
        accessibilityRole="button"
        onPress={() => router.push('/cart')}
        style={styles.bar}
        testID={testID}
      >
        <View style={styles.bagTile}>
          <Bag color={theme.color.neutral[0]} duo={theme.color.brand[200]} size={26} weight="duotone" />
          <Pop key={view.count} style={styles.count} trigger>
            <Text allowFontScaling={false} style={styles.countText} variant="micro">
              {view.count}
            </Text>
          </Pop>
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} variant="bodyStrong">
            {t('minibag.title')}
          </Text>
          <Text numberOfLines={1} style={styles.sub} variant="caption">
            {`${view.storeName} · ${view.count} ${noun}`}
          </Text>
        </View>
        <Money color={theme.color.neutral[0]} cents={total} size="sm" tabular />
      </Pressy>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 12 },
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.color.surface.ink, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8 },
  bagTile: { width: 46, height: 46, borderRadius: 14, backgroundColor: theme.color.brand[500], alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.accent.base, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countText: { color: theme.color.accent.onBase },
  texts: { flex: 1 },
  title: { color: theme.color.neutral[0] },
  sub: { color: theme.color.text.onInkMuted },
});
