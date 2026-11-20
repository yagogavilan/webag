import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Favorite } from '@webag/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { fetchFavorites } from '../../src/api/catalog-api';
import { useSession } from '../../src/api/session';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Heart } from '../../src/components/icons';
import { IconButton } from '../../src/components/IconButton';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { logoFallback } from '../../src/features/catalog/image';
import { ProductTile } from '../../src/features/catalog/ProductTile';
import { coverColor } from '../../src/features/catalog/StoreRow';
import { useSetFavorite, type FavoriteKind } from '../../src/features/favorites/hooks';
import { t } from '../../src/i18n';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

const GAP = theme.space[3];

/** D11. Favoritos (WB-019): lojas e produtos salvos. Remover é imediato, com "Desfazer"; indisponível permanece até remover. */
export default function FavoritesScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const session = useSession();
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<FavoriteKind>('store');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const mutation = useSetFavorite();
  const authed = session.status === 'authenticated';

  const query = useInfiniteQuery({
    queryKey: ['favorites', 'list', kind],
    queryFn: ({ pageParam }) => fetchFavorites({ kind, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: authed,
    staleTime: 60_000,
  });

  const items = useMemo(
    () =>
      (query.data?.pages.flatMap((p) => p.data) ?? []).filter((f) => {
        const id = f.kind === 'store' ? f.store?.id : f.product?.id;
        return id !== undefined && !hidden.has(`${f.kind}:${id}`);
      }),
    [query.data, hidden],
  );

  const columns = width >= 600 ? 3 : 2;
  const tile = Math.floor((Math.min(width, 720) - theme.layout.screenPaddingX * 2 - GAP * (columns - 1)) / columns);

  const setHiddenKey = (key: string, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const remove = (f: Favorite) => {
    const id = f.kind === 'store' ? f.store?.id : f.product?.id;
    if (!id) return;
    const key = `${f.kind}:${id}`;
    setHiddenKey(key, true);
    mutation.mutate(
      { kind: f.kind, id, on: false, silent: true },
      {
        onError: () => setHiddenKey(key, false),
        onSuccess: () =>
          toast.show(t('favorites.removed'), {
            label: t('favorites.undo'),
            onPress: () => {
              setHiddenKey(key, false);
              mutation.mutate({ kind: f.kind, id, on: true, silent: true });
            },
          }),
      },
    );
  };

  const header = <Header title={t('favorites.title')} />;

  if (!authed) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('favorites.visitorAction')} icon={Heart} onAction={() => router.push({ pathname: '/login', params: { returnTo: '/favorites' } })} testID="favorites.login" text={t('favorites.visitorText')} title={t('favorites.visitorTitle')} />
      </Screen>
    );
  }

  let body;
  if (query.isLoading) {
    body = (
      <View accessibilityLabel={t('common.loading')} style={styles.pad} testID="favorites.skeleton">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton height={72} key={i} style={{ marginBottom: theme.space[3] }} />
        ))}
      </View>
    );
  } else if (query.isError && !query.data) {
    body = (
      <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="favorites.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState actionLabel={t('favorites.emptyAction')} icon={Heart} onAction={() => router.replace('/')} testID="favorites.empty" text={t('favorites.emptyText')} title={t('favorites.emptyTitle')} />
    );
  } else {
    body = (
      <FlashList
        contentContainerStyle={styles.pad}
        data={items}
        key={`${kind}-${columns}`}
        keyExtractor={(f) => (f.kind === 'store' ? `s-${f.store?.id}` : `p-${f.product?.id}`)}
        numColumns={kind === 'product' ? columns : 1}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) =>
          item.kind === 'store' && item.store ? (
            <View style={styles.storeRow}>
              <Pressable
                accessibilityLabel={`${item.store.name}${item.unavailable ? `, ${t('favorites.unavailable')}` : ''}`}
                accessibilityRole="button"
                onPress={() => router.push(`/store/${item.store?.id}`)}
                style={styles.storeMain}
                testID={`favorites.item-${item.store.id}`}
              >
                <RemoteImage fallback={logoFallback(item.store.name, coverColor(item.store.id))} height={theme.size.avatarMd} urls={item.store.logo.urls} width={theme.size.avatarMd} />
                <View style={styles.flex}>
                  <Text numberOfLines={1} variant="bodyStrong">
                    {item.store.name}
                  </Text>
                  {item.unavailable ? <Badge label={t('favorites.unavailable')} /> : null}
                </View>
              </Pressable>
              <IconButton color={theme.color.feedback.danger.base} icon={Heart} label={t('favorites.remove', { name: item.store.name })} onPress={() => remove(item)} testID={`favorites.remove-${item.store.id}`} weight="fill" />
            </View>
          ) : item.product ? (
            <View style={styles.cell}>
              <View>
                <ProductTile
                  onPress={() => router.push(`/product/${item.product?.id}`)}
                  product={{
                    id: item.product.id,
                    name: item.product.name,
                    urls: item.product.image.urls,
                    priceCents: item.product.price?.amount ?? null,
                    storeName: item.product.storeName,
                    state: item.unavailable ? 'unavailable' : null,
                  }}
                  testID={`favorites.item-${item.product.id}`}
                  width={tile}
                />
                <View style={styles.heart}>
                  <IconButton color={theme.color.feedback.danger.base} icon={Heart} label={t('favorites.remove', { name: item.product.name })} onPress={() => remove(item)} overPhoto testID={`favorites.remove-${item.product.id}`} weight="fill" />
                </View>
              </View>
            </View>
          ) : null
        }
        testID="favorites.list"
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <Button label={t('common.tryAgain')} onPress={() => void query.fetchNextPage()} variant="text" />
          ) : null
        }
      />
    );
  }

  return (
    <Screen header={header} padded={false} scroll={false} testID="favorites.screen">
      <View style={styles.tabs}>
        <Segmented
          label={t('favorites.title')}
          onChange={setKind}
          options={[
            { value: 'store', label: t('favorites.tabStores'), testID: 'favorites.tab-stores' },
            { value: 'product', label: t('favorites.tabProducts'), testID: 'favorites.tab-products' },
          ]}
          value={kind}
        />
      </View>
      <View style={styles.flex}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[3] },
  pad: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[8] },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], minHeight: 72, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.subtle },
  storeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space[3], paddingVertical: theme.space[3] },
  cell: { paddingBottom: theme.space[4], alignItems: 'center' },
  heart: { position: 'absolute', top: theme.space[1], right: theme.space[1] },
});
