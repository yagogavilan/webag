import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { ArrowsClockwise } from '../../src/components/icons';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { useExchanges } from '../../src/features/exchanges/hooks';
import { isExchangeFailed } from '../../src/features/exchanges/model';
import { formatDateTime } from '../../src/features/orders/model';
import { t } from '../../src/i18n';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/** Minhas trocas (Conta). Abertas primeiro (a API já ordena por recência). Estados: skeleton, vazio, erro e offline. */
export default function ExchangesScreen() {
  const router = useRouter();
  const online = useOnline();
  const query = useExchanges();
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const header = <Header title={t('exchange.listTitle')} />;

  return (
    <Screen header={header} padded={false} scroll={false} testID="exchanges.screen">
      {query.isLoading ? (
        <View style={styles.pad} testID="exchanges.skeleton">
          {[0, 1, 2].map((i) => (
            <Skeleton height={72} key={i} radius={theme.radius.lg} />
          ))}
        </View>
      ) : query.isError && rows.length === 0 ? (
        <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="exchanges.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      ) : rows.length === 0 ? (
        <EmptyState actionLabel={t('exchange.listEmptyAction')} icon={ArrowsClockwise} onAction={() => router.replace('/orders' as never)} testID="exchanges.empty" text={t('exchange.listEmptyText')} title={t('exchange.listEmptyTitle')} />
      ) : (
        <FlashList
          contentContainerStyle={styles.pad}
          data={rows}
          keyExtractor={(x) => x.id}
          ListFooterComponent={query.hasNextPage ? <Button label={t('orders.loadMore')} loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} variant="text" /> : null}
          renderItem={({ item: x }) => (
            <Pressable
              accessibilityLabel={`${x.number}, ${t(`exchange.status.${x.status}` as 'exchange.status.requested')}, ${x.item?.name ?? ''}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/exchange/[id]', params: { id: x.id } } as never)}
              style={styles.row}
              testID={`exchange.list-item-${x.id}`}
            >
              <View style={styles.texts}>
                <Text variant="bodyStrong">{x.number}</Text>
                <Text color="secondary" numberOfLines={1} variant="caption">{x.item?.name ?? ''}</Text>
                <Badge label={t(`exchange.status.${x.status}` as 'exchange.status.requested')} tone={isExchangeFailed(x.status) ? 'danger' : x.status === 'completed' ? 'success' : 'info'} />
              </View>
              <Text color="secondary" variant="caption">{formatDateTime(x.createdAt)}</Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: theme.layout.screenPaddingX, gap: theme.space[3] },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: theme.space[3], backgroundColor: theme.color.surface.card, borderRadius: theme.radius.lg, padding: theme.space[3], marginBottom: theme.space[2] },
  texts: { flex: 1, gap: theme.space[1], alignItems: 'flex-start' },
});
