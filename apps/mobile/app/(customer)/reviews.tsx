import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Star } from '../../src/components/icons';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { useReviewsQuery } from '../../src/features/catalog/queries';
import { ReviewItem } from '../../src/features/catalog/ReviewItem';
import { ratingA11y } from '../../src/features/catalog/format';
import { t } from '../../src/i18n';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** D10. Avaliações (WB-018): somente leitura. Menos de 3 avaliações: a média não aparece, só "Novo" (a API já manda `isNew`). */
export default function ReviewsScreen() {
  const { kind, id, name } = useLocalSearchParams<{ kind?: string; id?: string; name?: string }>();
  const router = useRouter();
  const online = useOnline();
  const query = useReviewsQuery(kind === 'product' ? 'product' : 'store', id);
  const summary = query.data?.pages[0]?.summary;
  const reviews = query.data?.pages.flatMap((p) => p.data) ?? [];

  const header = <Header subtitle={name} title={t('reviews.title')} />;

  if (query.isLoading) {
    return (
      <Screen header={header} testID="reviews.skeleton">
        <Skeleton height={64} width={160} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton height={72} key={i} />
        ))}
      </Screen>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="reviews.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  if (reviews.length === 0 && (!summary || summary.count === 0)) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('reviews.emptyAction')} icon={Star} onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="reviews.empty" text={t('reviews.emptyText')} title={t('reviews.emptyTitle')} />
      </Screen>
    );
  }

  return (
    <Screen header={header} padded={false} scroll={false} testID="reviews.screen">
      <FlashList
        contentContainerStyle={styles.list}
        data={reviews}
        keyExtractor={(r) => r.id}
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <View style={styles.footer}>
              <Text color="secondary">{t('states.errorText')}</Text>
              <Button label={t('common.tryAgain')} onPress={() => void query.fetchNextPage()} variant="text" />
            </View>
          ) : query.isFetchingNextPage ? (
            <Skeleton height={72} />
          ) : query.hasNextPage ? (
            <Button label={t('reviews.loadMore')} onPress={() => void query.fetchNextPage()} testID="reviews.load-more" variant="secondary" />
          ) : null
        }
        ListHeaderComponent={
          summary ? (
            <View accessible accessibilityLabel={ratingA11y(summary)} style={styles.summary} testID="reviews.summary">
              {summary.isNew || summary.average === null ? (
                <>
                  <Text variant="numeral">{t('reviews.new')}</Text>
                  <Text color="secondary">{t('reviews.newText')}</Text>
                </>
              ) : (
                <>
                  <Text variant="numeral">{decimal.format(summary.average)}</Text>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star color={theme.color.rating.star} key={n} size={20} weight={n <= Math.round(summary.average ?? 0) ? 'fill' : 'regular'} />
                    ))}
                  </View>
                  <Text color="secondary">{t('reviews.count', { count: summary.count })}</Text>
                </>
              )}
            </View>
          ) : null
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => <ReviewItem review={item} />}
        testID="reviews.list"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[8] },
  summary: { gap: theme.space[1], paddingVertical: theme.space[4] },
  stars: { flexDirection: 'row', gap: 2 },
  footer: { paddingVertical: theme.space[3], alignItems: 'flex-start' },
});
