import { FlashList } from '@shopify/flash-list';
import type { BrowseProductItem, BrowseStore } from '@webag/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ApiError } from '../../../src/api/problem';
import { Badge } from '../../../src/components/Badge';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { CaretLeft, ArrowsClockwise, Clock, Heart, Package, Star, ShareNetwork, Storefront, Truck } from '../../../src/components/icons';
import { IconButton } from '../../../src/components/IconButton';
import { RemoteImage } from '../../../src/components/RemoteImage';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { closedLabel, closesAtToday, formatDistance, formatEta, formatFee, formatRating, ratingA11y } from '../../../src/features/catalog/format';
import { fromBrowseItem, ProductTile } from '../../../src/features/catalog/ProductTile';
import { modeStore, useDeliveryPoint, useStoreProductsQuery, useStoreQuery } from '../../../src/features/catalog/queries';
import { AboutStoreSheet, ExchangePolicySheet } from '../../../src/features/catalog/StoreSheets';
import { useCartView } from '../../../src/features/cart/hooks';
import { useApplyPendingFavorite, useFavorite } from '../../../src/features/favorites/hooks';
import { t } from '../../../src/i18n';
import { formatMoney } from '../../../src/lib/format';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

type Row =
  | { type: 'header' }
  | { type: 'tabs' }
  | { type: 'products'; items: BrowseProductItem[]; key: string }
  | { type: 'state' };

const GAP = theme.space[3];

/** D8. Loja (WB-016): capa, logo, nota, aberta/fechada, taxa e tempo, retirada, trocas e vitrine por seções. Loja fechada é navegável (DEC-022). */
export default function StoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const point = useDeliveryPoint();
  const { width } = useWindowDimensions();
  const store = useStoreQuery(id, point);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const products = useStoreProductsQuery(id, sectionId);
  const { view: cart } = useCartView();
  const [sheet, setSheet] = useState<'exchange' | 'about' | null>(null);
  const favorite = useFavorite('store', id, store.data?.name ?? '');
  useApplyPendingFavorite(favorite.applyPending, Boolean(store.data));

  const columns = width >= 600 ? 3 : 2;
  const content = Math.min(width, 720);
  const tile = Math.floor((content - theme.layout.screenPaddingX * 2 - GAP * (columns - 1)) / columns);

  const items = useMemo(() => {
    const all = products.data?.pages.flatMap((p) => p.data) ?? [];
    // indisponíveis ao final (onda-3 D8 passo 6); a ordem da API se mantém dentro de cada grupo
    return [...all.filter((p) => p.available), ...all.filter((p) => !p.available)];
  }, [products.data]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ type: 'header' }, { type: 'tabs' }];
    for (let i = 0; i < items.length; i += columns) out.push({ type: 'products', items: items.slice(i, i + columns), key: items[i]?.id ?? String(i) });
    if (items.length === 0) out.push({ type: 'state' });
    return out;
  }, [items, columns]);

  if (store.isError && store.error instanceof ApiError && store.error.status === 404) {
    return (
      <Screen header={<BackBar />}>
        <EmptyState actionLabel={t('store.notFoundAction')} icon={Storefront} onAction={() => router.replace('/')} testID="store.not-found" text={t('store.notFoundText')} title={t('store.notFoundTitle')} />
      </Screen>
    );
  }
  if (store.isError && !store.data) {
    return (
      <Screen header={<BackBar />}>
        <ErrorState offline={!online} onRetry={() => void store.refetch()} retryLabel={t('common.tryAgain')} testID="store.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  if (!store.data) {
    return (
      <Screen header={<BackBar />} testID="store.skeleton">
        <Skeleton height={180} />
        <Skeleton height={24} width="50%" />
        <Skeleton height={16} width="80%" />
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ gap: theme.space[2] }}>
              <Skeleton height={tile} width={tile} />
              <Skeleton height={14} width={tile * 0.6} />
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  const data = store.data;
  const sameStoreCart = cart !== null && cart.storeId === data.id;
  const cartCount = cart?.count ?? 0;
  const noun = cartCount === 1 ? t('cart.itemOne') : t('cart.itemMany');

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.type) {
      case 'header':
        return (
          <StoreHeader
            favorite={favorite}
            onAbout={() => setSheet('about')}
            onExchange={() => setSheet('exchange')}
            onReviews={() => router.push({ pathname: '/reviews', params: { kind: 'store', id: data.id, name: data.name } })}
            onShare={() => void Share.share({ message: t('store.shareMessage', { name: data.name }) })}
            pointDefined={point !== null}
            approximate={point?.approximate ?? true}
            store={data}
          />
        );
      case 'tabs':
        return (
          <View style={styles.tabsWrap}>
            <ScrollView accessibilityLabel={t('store.sectionsLabel')} contentContainerStyle={styles.tabs} horizontal showsHorizontalScrollIndicator={false}>
              <SectionTab label={t('store.allProducts')} onPress={() => setSectionId(null)} selected={sectionId === null} testID="store.tab-all" />
              {data.sections.map((s) => (
                <SectionTab key={s.id} label={s.name} onPress={() => setSectionId(s.id)} selected={sectionId === s.id} testID={`store.tab-${s.id}`} />
              ))}
            </ScrollView>
          </View>
        );
      case 'products':
        return (
          <View style={[styles.productRow, { gap: GAP }]}>
            {item.items.map((p) => (
              <ProductTile
                key={p.id}
                onPress={() => router.push(`/product/${p.id}`)}
                product={fromBrowseItem(p)}
                testID={`store.product-${p.id}`}
                width={tile}
              />
            ))}
          </View>
        );
      case 'state':
        if (products.isLoading) {
          return (
            <View style={styles.skeletonGrid}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton height={tile} key={i} width={tile} />
              ))}
            </View>
          );
        }
        if (products.isError) {
          return <ErrorState onRetry={() => void products.refetch()} retryLabel={t('common.tryAgain')} text={t('states.errorText')} title={t('states.errorTitle')} />;
        }
        return (
          <EmptyState actionLabel={t('store.emptyAction')} icon={Package} onAction={() => router.replace('/')} testID="store.empty" text={t('store.emptyText')} title={t('store.emptyTitle')} />
        );
    }
  };

  return (
    <Screen
      bottomInset
      footer={
        sameStoreCart ? (
          <Button
            accessibilityLabel={t('store.cartBarA11y', { count: cartCount, noun, total: formatMoney(cart?.subtotalCents ?? 0) })}
            label={t('store.cartBar', { count: cartCount, noun, total: formatMoney(cart?.subtotalCents ?? 0) })}
            onPress={() => router.push('/cart')}
            size="lg"
            testID="store.cart-bar"
          />
        ) : undefined
      }
      padded={false}
      scroll={false}
      testID="store.screen"
    >
      <FlashList
        data={rows}
        getItemType={(r) => r.type}
        keyExtractor={(r) => (r.type === 'products' ? `products-${r.key}` : r.type)}
        onEndReached={() => {
          if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        testID="store.list"
        ListFooterComponent={
          products.isFetchingNextPage ? (
            <View style={styles.footerLoading}>
              <Skeleton height={tile} width={tile} />
              <Skeleton height={tile} width={tile} />
            </View>
          ) : products.isFetchNextPageError ? (
            <View style={styles.footerLoading}>
              <Text color="secondary">{t('store.loadMoreError')}</Text>
              <Button label={t('common.tryAgain')} onPress={() => void products.fetchNextPage()} variant="text" />
            </View>
          ) : null
        }
      />
      <ExchangePolicySheet onClose={() => setSheet(null)} store={data} visible={sheet === 'exchange'} />
      <AboutStoreSheet onClose={() => setSheet(null)} store={data} visible={sheet === 'about'} />
    </Screen>
  );
}

function BackBar() {
  const router = useRouter();
  return (
    <View style={styles.backBar}>
      <IconButton icon={CaretLeft} label={t('store.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="store.back" />
    </View>
  );
}

function SectionTab({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected && styles.tabSelected]}
      testID={testID}
    >
      <Text color={selected ? 'brand' : 'secondary'} variant="label">
        {label}
      </Text>
    </Pressable>
  );
}

interface HeaderProps {
  store: BrowseStore;
  favorite: ReturnType<typeof useFavorite>;
  onAbout: () => void;
  onExchange: () => void;
  onReviews: () => void;
  onShare: () => void;
  pointDefined: boolean;
  approximate: boolean;
}

function StoreHeader({ store, favorite, onAbout, onExchange, onReviews, onShare, pointDefined, approximate }: HeaderProps) {
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const coverWidth = Math.min(width, 720);
  const d = store.delivery;
  const closes = store.open ? closesAtToday(store.hoursToday) : null;
  const status = store.open ? (closes ? t('store.openUntil', { time: closes }) : t('store.open')) : closedLabel(store.opensAt);
  const fee = formatFee(d.feeCents, { approximate });
  const meta = [formatEta(d.etaMinMinutes, d.etaMaxMinutes), fee ?? undefined, d.distanceM !== null ? formatDistance(d.distanceM) : undefined].filter(Boolean).join(' · ');
  const freeAbove = d.freeAboveCents > 0 ? t('catalog.freeAbove', { value: formatMoney(d.freeAboveCents) }) : null;
  const metaA11y = t('store.meta', {
    eta: formatEta(d.etaMinMinutes, d.etaMaxMinutes),
    fee: fee ?? 'a calcular',
    distance: d.distanceM !== null ? formatDistance(d.distanceM) : 'distância indisponível',
  });
  const noDelivery = pointDefined && d.available === false;
  const pickupEta = store.pickup.enabled ? formatEta(store.pickup.prepMinMinutes, store.pickup.prepMaxMinutes) : null;
  const favoriteLabel = favorite.isFavorite ? t('store.unfavorite', { name: store.name }) : t('store.favorite', { name: store.name });

  return (
    <View>
      <View>
        <RemoteImage aspectRatio={16 / 9} priority="high" radius={0} style={{ maxHeight: 320 }} urls={store.cover.urls} width={coverWidth} />
        <View style={styles.coverActions}>
          <IconButton icon={CaretLeft} label={t('store.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} overPhoto testID="store.back" />
          <View style={styles.coverRight}>
            <IconButton
              color={favorite.isFavorite ? theme.color.feedback.danger.base : theme.color.text.primary}
              icon={Heart}
              label={favoriteLabel}
              onPress={() => {
                favorite.toggle();
              }}
              overPhoto
              testID="store.favorite"
              weight={favorite.isFavorite ? 'fill' : 'regular'}
            />
            <IconButton icon={ShareNetwork} label={t('store.share')} onPress={onShare} overPhoto testID="store.share" />
          </View>
        </View>
        <View style={styles.logo}>
          <RemoteImage alt={t('catalog.logoAlt', { name: store.name })} height={theme.size.avatarMd} radius={theme.radius.md} style={styles.logoBorder} urls={store.logo.urls} width={theme.size.avatarMd} />
        </View>
      </View>

      <View style={styles.info}>
        <Text accessibilityRole="header" style={styles.nameSpace} variant="title2">
          {store.name}
        </Text>
        <View style={styles.rowWrap}>
          <Pressable accessibilityLabel={`${t('store.reviews')}, ${ratingA11y(store.rating)}`} accessibilityRole="button" onPress={onReviews} style={styles.rating} testID="store.rating">
            <Star color={theme.color.rating.star} size={20} weight="fill" />
            <Text variant="bodyStrong">{formatRating(store.rating)}</Text>
          </Pressable>
          <Badge icon={Clock} label={status} tone={store.open ? 'success' : 'neutral'} />
        </View>

        {!store.open ? (
          <Banner testID="store.closed-banner" text={store.opensAt ? t('store.closedBanner', { label: closedLabel(store.opensAt) }) : t('store.pausedBanner')} tone="info" />
        ) : null}
        {noDelivery ? (
          <Banner
            actionLabel={store.pickup.offered ? t('store.pickupHere') : t('store.changeAddress')}
            onAction={() => {
              if (store.pickup.offered) {
                void modeStore.set('pickup');
                toast.show(t('home.modePickup'));
              } else router.push('/addresses');
            }}
            testID="store.no-delivery-banner"
            text={t('store.noDeliveryTitle')}
            tone="warning"
          />
        ) : null}

        <View accessible accessibilityLabel={metaA11y} style={styles.metaBlock}>
          <MetaLine icon={Truck} text={meta} />
          {freeAbove ? <MetaLine icon={Truck} text={freeAbove} /> : null}
          {d.minOrderCents > 0 ? <MetaLine icon={Package} text={t('store.minOrder', { value: formatMoney(d.minOrderCents) })} /> : null}
          {pickupEta ? <MetaLine icon={Storefront} text={t('store.pickup', { eta: pickupEta })} /> : null}
        </View>

        <View style={styles.rowWrap}>
          {store.exchangePolicy.voluntaryDays > 0 ? <Badge icon={ArrowsClockwise} label={t('catalog.acceptsExchange')} tone="brand" /> : null}
          {d.freeShipping ? <Badge icon={Truck} label={t('catalog.freeShipping')} tone="success" /> : null}
        </View>
        <View style={styles.links}>
          <Button label={t('store.exchangePolicy')} onPress={onExchange} testID="store.exchange-policy" variant="text" />
          <Button label={t('store.about')} onPress={onAbout} testID="store.about" variant="text" />
        </View>
      </View>
    </View>
  );
}

function MetaLine({ icon: Icon, text }: { icon: typeof Truck; text: string }) {
  return (
    <View style={styles.metaLine}>
      <Icon color={theme.color.text.secondary} size={theme.size.iconSm} />
      <Text color="secondary">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backBar: { minHeight: theme.size.headerHeight, justifyContent: 'center', paddingHorizontal: theme.space[1] },
  coverActions: { position: 'absolute', top: theme.space[2], left: theme.space[2], right: theme.space[2], flexDirection: 'row', justifyContent: 'space-between' },
  coverRight: { flexDirection: 'row', gap: theme.space[2] },
  logo: { position: 'absolute', left: theme.layout.screenPaddingX, bottom: -theme.size.avatarMd / 2 },
  logoBorder: { borderWidth: theme.borderWidth.strong, borderColor: theme.color.surface.card },
  info: { paddingHorizontal: theme.layout.screenPaddingX, paddingTop: theme.size.avatarMd / 2 + theme.space[2], gap: theme.space[2], paddingBottom: theme.space[2] },
  nameSpace: { paddingTop: theme.space[1] },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space[2] },
  rating: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1], minHeight: theme.size.touchMin },
  metaBlock: { gap: theme.space[1] },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2] },
  links: { flexDirection: 'row', gap: theme.space[2], marginLeft: -theme.space[4] },
  tabsWrap: { backgroundColor: theme.color.surface.background, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.subtle },
  tabs: { paddingHorizontal: theme.layout.screenPaddingX, gap: theme.space[2] },
  tab: { minHeight: theme.size.touchMin, paddingHorizontal: theme.space[3], justifyContent: 'center', borderBottomWidth: theme.borderWidth.strong, borderBottomColor: 'transparent' },
  tabSelected: { borderBottomColor: theme.color.border.focus },
  productRow: { flexDirection: 'row', paddingHorizontal: theme.layout.screenPaddingX, paddingTop: theme.space[4] },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, padding: theme.layout.screenPaddingX },
  footerLoading: { flexDirection: 'row', gap: GAP, padding: theme.layout.screenPaddingX, alignItems: 'center' },
});
