import { FlashList } from '@shopify/flash-list';
import type { BrowseProductItem, BrowseStore } from '@webag/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ApiError } from '../../../src/api/problem';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { CaretLeft, ArrowsClockwise, Heart, Package, Star, ShareNetwork, Storefront, Ticket as TicketIcon } from '../../../src/components/icons';
import { DiagonalBlock } from '../../../src/components/DiagonalBlock';
import { Sticker } from '../../../src/components/Sticker';
import { ProductArt, objectFor } from '../../../src/art/ProductArt';
import { MiniBag } from '../../../src/features/cart/MiniBag';
import { Pressy } from '../../../src/motion';
import { ReportButton } from '../../../src/features/report/ReportSheet';
import { deliveryEta } from '../../../src/features/catalog/eta';
import { logoFallback } from '../../../src/features/catalog/image';
import { deliveryUnavailable } from '../../../src/features/catalog/unavailable';
import { coverColor, initials } from '../../../src/features/catalog/StoreRow';
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
  | { type: 'highlights' }
  | { type: 'tabs' }
  | { type: 'products'; items: BrowseProductItem[]; key: string }
  | { type: 'state' };

const GAP = theme.space[3];
const COVER_H = 184;

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

  // Destaques: o que está em oferta na vitrine carregada (só com preço antigo visível; sem oferta, a seção não aparece)
  const highlights = useMemo(() => items.filter((p) => p.available && p.originalPrice && p.discountPercent).slice(0, 6), [items]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ type: 'header' }, ...(highlights.length > 0 ? [{ type: 'highlights' } as const] : []), { type: 'tabs' }];
    for (let i = 0; i < items.length; i += columns) out.push({ type: 'products', items: items.slice(i, i + columns), key: items[i]?.id ?? String(i) });
    if (items.length === 0) out.push({ type: 'state' });
    return out;
  }, [items, columns, highlights]);

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
      case 'highlights':
        return (
          <View style={styles.highlights} testID="store.highlights">
            <Text accessibilityRole="header" style={styles.highlightsTitle} variant="title1">
              {t('store.highlights')}
            </Text>
            <ScrollView contentContainerStyle={styles.highlightsRow} horizontal showsHorizontalScrollIndicator={false}>
              {highlights.map((p, i) => (
                <View key={p.id}>
                  <ProductTile onPress={() => router.push(`/product/${p.id}`)} product={fromBrowseItem(p)} testID={`store.highlight-${p.id}`} width={140} />
                  {i === 0 ? <Sticker label={t('store.mostOrdered')} rotate={-6} style={styles.stickerPos} /> : null}
                </View>
              ))}
            </ScrollView>
          </View>
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
        stickyHeaderIndices={[rows.findIndex((r) => r.type === 'tabs')]}
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
      {sameStoreCart ? <MiniBag testID="store.cart-bar" /> : null}
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
    <Pressy
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      feedback="selection"
      onPress={onPress}
      pressedScale={0.97}
      style={[styles.tab, selected && styles.tabSelected]}
      testID={testID}
    >
      <Text color={selected ? 'brand' : 'secondary'} variant="label">
        {label}
      </Text>
    </Pressy>
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
  const { top } = useSafeAreaInsets();
  const d = store.delivery;
  const closes = store.open ? closesAtToday(store.hoursToday) : null;
  const status = store.open ? (closes ? t('store.openUntil', { time: closes }) : t('store.open')) : closedLabel(store.opensAt);
  const fee = formatFee(d.feeCents, { approximate });
  const range = pointDefined ? deliveryEta(d) : deliveryEta({ ...d, available: null });
  const noDelivery = pointDefined && d.available === false;
  // Logística fora do horário ou pausada (BUG-016/RN-18): só retirada; "Entregas voltam às 9h" quando há hora, "pausadas agora" quando não
  // A causa vem de `unavailableReason` (WB-260); sem causa: "Entrega indisponível agora"
  const unavailable = noDelivery || d.unavailableReason ? deliveryUnavailable(d) : null;
  const opsClosed = unavailable?.kind === 'closed' || unavailable?.kind === 'paused';
  const etaBand = range ? t('store.etaBand', { start: range.start, end: range.end }) : (unavailable?.chip ?? t('catalog.outOfArea'));
  const freeAbove = d.freeAboveCents > 0 ? t('store.couponFree', { value: formatMoney(d.freeAboveCents) }) : null;
  const metaA11y = t('store.meta', {
    eta: etaBand,
    fee: fee ?? 'a calcular',
    distance: d.distanceM !== null ? formatDistance(d.distanceM) : 'distância indisponível',
  });
  const pickupEta = store.pickup.enabled ? formatEta(store.pickup.prepMinMinutes, store.pickup.prepMaxMinutes) : null;
  const favoriteLabel = favorite.isFavorite ? t('store.unfavorite', { name: store.name }) : t('store.favorite', { name: store.name });
  const color = coverColor(store.id);
  const hasCover = Object.keys(store.cover.urls ?? {}).length > 0;
  const hasLogo = Object.keys(store.logo.urls ?? {}).length > 0;
  const { width } = useWindowDimensions();
  const coverWidth = Math.min(width, 720);

  return (
    <View>
      <View style={{ height: COVER_H + top }}>
        {hasCover ? (
          <RemoteImage
            fallback={{ art: objectFor(store.name + ' ' + (store.description ?? '')), color: '#F2EFE9', ground: 'rgba(0,0,0,0.35)', background: color }}
            height={COVER_H + top}
            priority="high"
            radius={0}
            urls={store.cover.urls}
            width={coverWidth}
          />
        ) : (
          <DiagonalBlock color={color} height={COVER_H + top} style={StyleSheet.absoluteFill}>
            <View pointerEvents="none" style={styles.coverArt}>
              <ProductArt color="#F2EFE9" ground="rgba(0,0,0,0.35)" name={objectFor(store.name + ' ' + (store.description ?? ''))} size={150} />
            </View>
          </DiagonalBlock>
        )}
        <View style={[styles.coverActions, { top: top + theme.space[2] }]}>
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
        <View style={styles.logoWrap}>
          <View style={styles.logoShadow} />
          <View style={styles.logo}>
            {hasLogo ? (
              <RemoteImage alt={t('catalog.logoAlt', { name: store.name })} fallback={logoFallback(store.name, color)} height={60} radius={16} urls={store.logo.urls} width={60} />
            ) : (
              <Text style={{ color }} variant="title1">
                {initials(store.name)}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.info}>
        <Text accessibilityRole="header" variant="display">
          {store.name}
        </Text>
        <Text color={store.open ? 'success' : 'secondary'} variant="captionStrong">
          {status}
        </Text>

        {!store.open ? (
          <Banner testID="store.closed-banner" text={store.opensAt ? t('store.closedBanner', { label: closedLabel(store.opensAt) }) : t('store.pausedBanner')} tone="info" />
        ) : null}
        {opsClosed && unavailable ? (
          <Banner
            actionLabel={store.pickup.offered ? t('ops.pickupHere') : undefined}
            onAction={
              store.pickup.offered
                ? () => {
                    void modeStore.set('pickup');
                    toast.show(t('home.modePickup'));
                  }
                : undefined
            }
            testID="store.ops-banner"
            text={`${unavailable.title}${unavailable.sub ? `. ${unavailable.sub}` : ''}`}
            tone="info"
          />
        ) : noDelivery ? (
          <Banner
            actionLabel={store.pickup.offered ? t('store.pickupHere') : t('store.changeAddress')}
            onAction={() => {
              if (store.pickup.offered) {
                void modeStore.set('pickup');
                toast.show(t('home.modePickup'));
              } else router.push('/addresses');
            }}
            testID="store.no-delivery-banner"
            text={unavailable?.kind === 'unknown' ? `${unavailable.title}.` : t('store.noDeliveryTitle')}
            tone="warning"
          />
        ) : null}

        <View accessible accessibilityLabel={metaA11y} style={styles.stats}>
          <Pressy accessibilityLabel={`${t('store.reviews')}, ${ratingA11y(store.rating)}`} accessibilityRole="button" onPress={onReviews} style={styles.stat} testID="store.rating">
            <View style={styles.statTop}>
              <Text variant="title1">{formatRating(store.rating).split(' · ')[0]}</Text>
              <Star color={theme.color.rating.star} size={16} weight="fill" />
            </View>
            <Text color="secondary" variant="caption">
              {store.rating.isNew || store.rating.average === null ? t('store.reviews') : t('store.reviewsCount', { count: store.rating.count })}
            </Text>
          </Pressy>
          {range ? (
            <View style={[styles.stat, styles.statMid]} testID="store.eta">
              <Text variant="title1">{`${range.start} – ${range.end}`}</Text>
              <Text color="secondary" variant="caption">
                {t('store.etaCaption')}
              </Text>
            </View>
          ) : null}
          {fee !== null ? (
            <View style={[styles.stat, range ? null : styles.statDivider]}>
              <Text variant="title1">{fee}</Text>
              <Text color="secondary" variant="caption">
                {t('store.feeCaption')}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.tickets} horizontal showsHorizontalScrollIndicator={false} style={styles.ticketsScroll}>
          {freeAbove ? <Ticket label={freeAbove} /> : null}
          {pickupEta ? <Ticket label={t('store.pickupFree', { address: store.pickup.address ?? store.name })} icon="store" /> : null}
          {store.exchangePolicy.voluntaryDays > 0 ? <Ticket label={t('store.exchangeTicket', { days: store.exchangePolicy.voluntaryDays })} icon="exchange" /> : null}
          {d.minOrderCents > 0 ? <Ticket label={t('store.minOrder', { value: formatMoney(d.minOrderCents) })} icon="box" /> : null}
        </ScrollView>
        <View style={styles.links}>
          <Button label={t('store.exchangePolicy')} onPress={onExchange} style={styles.linkButton} testID="store.exchange-policy" variant="text" />
          <Button label={t('store.about')} onPress={onAbout} style={styles.linkButton} testID="store.about" variant="text" />
          <ReportButton target="store" targetId={store.id} testID="store.report" />
        </View>
      </View>
    </View>
  );
}

/** Bilhete de vantagem (cupom, retirada, troca): bloco com recorte, ícone duotone de marca e texto curto. */
function Ticket({ label, icon = 'coupon' }: { label: string; icon?: 'coupon' | 'store' | 'exchange' | 'box' }) {
  const Icon = icon === 'store' ? Storefront : icon === 'exchange' ? ArrowsClockwise : icon === 'box' ? Package : TicketIcon;
  return (
    <View accessible accessibilityLabel={label} style={styles.ticket}>
      <Icon color={theme.color.action.primary} duo={theme.color.brand[300]} size={28} weight="duotone" />
      <Text numberOfLines={2} style={styles.ticketText} variant="captionStrong">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backBar: { minHeight: theme.size.headerHeight, justifyContent: 'center', paddingHorizontal: theme.space[1] },
  coverActions: { position: 'absolute', left: theme.space[3], right: theme.space[3], flexDirection: 'row', justifyContent: 'space-between' },
  coverRight: { flexDirection: 'row', gap: theme.space[2] },
  coverArt: { position: 'absolute', right: 24, top: 36 },
  logoWrap: { position: 'absolute', left: theme.layout.screenPaddingX, bottom: -28 },
  logoShadow: { position: 'absolute', left: theme.hardShadow.offsetLg, top: theme.hardShadow.offsetLg, width: 64, height: 64, borderRadius: 18, backgroundColor: theme.color.surface.ink, transform: [{ rotate: '-6deg' }] },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: theme.color.neutral[0], alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transform: [{ rotate: '-6deg' }] },
  info: { paddingHorizontal: theme.layout.screenPaddingX, paddingTop: 40, gap: theme.space[2], paddingBottom: theme.space[2] },
  stats: { flexDirection: 'row', borderTopWidth: theme.borderWidth.strong, borderTopColor: theme.color.neutral[900], marginTop: theme.space[3] },
  stat: { flex: 1, paddingVertical: theme.space[3], gap: 2, justifyContent: 'center', minHeight: theme.size.touchMin },
  statMid: { paddingHorizontal: theme.space[3], borderLeftWidth: theme.borderWidth.hairline, borderRightWidth: theme.borderWidth.hairline, borderColor: theme.color.border.default },
  statDivider: { paddingLeft: theme.space[3], borderLeftWidth: theme.borderWidth.hairline, borderColor: theme.color.border.default },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ticketsScroll: { marginHorizontal: -theme.layout.screenPaddingX },
  tickets: { paddingHorizontal: theme.layout.screenPaddingX, gap: theme.space[3], paddingVertical: theme.space[2] },
  ticket: { width: 200, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: theme.space[3], backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.lg, paddingHorizontal: theme.space[3], paddingVertical: theme.space[2] },
  ticketText: { flex: 1 },
  // Os 3 links numa linha só (V8.6): botões de texto com folga curta; quebra só com fonte muito grande.
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: theme.space[1], marginLeft: -theme.space[2] },
  linkButton: { minWidth: 0, paddingHorizontal: theme.space[2] },
  highlights: { paddingTop: theme.space[4], gap: theme.space[3] },
  highlightsTitle: { paddingHorizontal: theme.layout.screenPaddingX },
  highlightsRow: { paddingHorizontal: theme.layout.screenPaddingX, gap: theme.space[3] },
  stickerPos: { position: 'absolute', left: 8, bottom: 96 },
  tabsWrap: { backgroundColor: theme.color.surface.card, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.subtle },
  tabs: { paddingHorizontal: theme.layout.screenPaddingX, gap: theme.space[2] },
  tab: { minHeight: theme.size.touchMin, paddingHorizontal: theme.space[3], justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabSelected: { borderBottomColor: theme.color.brand[500] },
  productRow: { flexDirection: 'row', paddingHorizontal: theme.layout.screenPaddingX, paddingTop: theme.space[4] },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, padding: theme.layout.screenPaddingX },
  footerLoading: { flexDirection: 'row', gap: GAP, padding: theme.layout.screenPaddingX, alignItems: 'center' },
});
