import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../../components/Skeleton';
import { t } from '../../i18n';
import { theme } from '../../theme';

/** Esqueleto com a forma do Início v3 (o cabeçalho roxo já está na tela): faixa de categorias 88 e cartões de loja com capa. */
export function HomeSkeleton() {
  return (
    <View accessibilityLabel={t('common.loading')} accessible style={styles.wrap} testID="home.skeleton">
      <View style={styles.row}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.cat}>
            <Skeleton height={88} radius={i === 1 ? 44 : 24} width={88} />
            <Skeleton height={14} width={60} />
          </View>
        ))}
      </View>
      {[0, 1].map((i) => (
        <View key={i} style={styles.store}>
          <Skeleton height={148} radius={theme.radius.card} />
          <View style={styles.lines}>
            <Skeleton height={20} width="55%" />
            <Skeleton height={14} width="75%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space[6], paddingHorizontal: theme.layout.screenPaddingX, paddingTop: theme.space[5] },
  row: { flexDirection: 'row', gap: theme.space[3], overflow: 'hidden' },
  cat: { gap: theme.space[2] },
  store: { gap: theme.space[3] },
  lines: { gap: theme.space[2], paddingTop: theme.space[3] },
});
