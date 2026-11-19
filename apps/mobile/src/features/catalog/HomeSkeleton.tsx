import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../../components/Skeleton';
import { t } from '../../i18n';
import { theme } from '../../theme';

/** Forma idêntica ao Início: banner 2:1, círculos de categoria, linhas de loja e 4 tiles (onda-3 D5, estado Skeleton). */
export function HomeSkeleton() {
  return (
    <View accessibilityLabel={t('common.loading')} style={styles.wrap} testID="home.skeleton">
      <Skeleton height={140} radius={theme.radius.lg} />
      <View style={styles.row}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton height={64} key={i} radius={theme.radius.full} width={64} />
        ))}
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.store}>
          <Skeleton height={56} width={56} />
          <View style={styles.lines}>
            <Skeleton height={16} width="60%" />
            <Skeleton height={12} width="40%" />
            <Skeleton height={12} width="80%" />
          </View>
        </View>
      ))}
      <View style={styles.row}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.tile}>
            <Skeleton height={120} width={120} />
            <Skeleton height={14} width={80} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space[4], paddingHorizontal: theme.layout.screenPaddingX },
  row: { flexDirection: 'row', gap: theme.space[3], overflow: 'hidden' },
  store: { flexDirection: 'row', gap: theme.space[3] },
  lines: { flex: 1, gap: theme.space[2] },
  tile: { gap: theme.space[2] },
});
