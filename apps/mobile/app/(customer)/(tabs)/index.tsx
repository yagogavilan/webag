import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { Banner, Category, StoreCard } from '@webag/shared';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button } from '../../../src/components/Button';
import { MagnifyingGlass, MapPin, Storefront } from '../../../src/components/icons';
import { Money } from '../../../src/components/Money';
import { Pressy } from '../../../src/motion';
import { Screen } from '../../../src/components/Screen';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { Segmented } from '../../../src/components/Segmented';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useCurrentAddress } from '../../../src/features/address/store';
import { addressLine } from '../../../src/features/address/types';
import { EmailVerifyBanner } from '../../../src/features/auth/EmailVerifyBanner';
import { BannerCarousel } from '../../../src/features/catalog/BannerCarousel';
import { CategoryRow } from '../../../src/features/catalog/CategoryRow';
import { HomeSkeleton } from '../../../src/features/catalog/HomeSkeleton';
import { fromProductCard, ProductTile, type ProductTileData } from '../../../src/features/catalog/ProductTile';
import { modeStore, useBannersQuery, useCategoriesQuery, useCategoryNames, useDeliveryPoint, useHomeQuery } from '../../../src/features/catalog/queries';
import { StoreCoverCard } from '../../../src/features/catalog/StoreCoverCard';
import { StoreRow } from '../../../src/features/catalog/StoreRow';
import { HomeHero } from '../../../src/features/catalog/HomeHero';
import { OfferBento } from '../../../src/features/catalog/OfferBento';
import { MiniBag } from '../../../src/features/cart/MiniBag';
import { t } from '../../../src/i18n';
import { RemoteImage } from '../../../src/components/RemoteImage';
import { haptic } from '../../../src/lib/haptics';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

type Row =
  | { type: 'banners'; banners: Banner[] }
  | { type: 'categories'; categories: Category[] }
  | { type: 'title'; id: string; title: string; action?: 'stores' }
  | { type: 'store'; store: StoreCard }
  | { type: 'offers'; products: ProductTileData[] }
  | { type: 'bestsellers'; products: ProductTileData[] }
  | { type: 'new-stores'; stores: StoreCard[] }
  | { type: 'error'; id: 'banners' | 'categories' | 'home' }
  | { type: 'empty' }
  | { type: 'pickup-empty' };

const OFFER_TILE = 140;

/** Abertas primeiro, fechadas depois (onda-3 D5 bloco 6); a ordem por distância da API se mantém dentro de cada grupo. */
const openFirst = (stores: readonly StoreCard[]): StoreCard[] => [...stores.filter((s) => s.open), ...stores.filter((s) => !s.open)];

/**
 * D5. Início (WB-005, 011, 012, 036): banners, categorias, lojas perto, ofertas, mais vendidos e lojas novas. Sem login.
 * Seção sem itens não aparece; seção que falhou mostra "Não carregou. Tentar de novo" e as outras seguem.
 */
export default function CustomerHome() {
  const router = useRouter();
  const navigation = useNavigation();
  const online = useOnline();
  const address = useCurrentAddress();
  const point = useDeliveryPoint();
  const mode = modeStore.useValue();
  const insets = useSafeAreaInsets();
  const home = useHomeQuery(point, mode);
  const categories = useCategoriesQuery();
  const banners = useBannersQuery();
  const { names } = useCategoryNames();
  const list = useRef<FlashListRef<Row>>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const pickup = mode === 'pickup';

  // Barra de status clara sobre a faixa roxa enquanto o Início está em foco
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  // Toque na aba ativa volta ao topo (onda-3 D5 Interações)
  useEffect(() => {
    const unsubscribe = (navigation as unknown as { addListener: (e: string, cb: () => void) => () => void }).addListener('tabPress', () => {
      if (navigation.isFocused()) void list.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    void haptic('light');
    await Promise.allSettled([home.refetch(), categories.refetch(), banners.refetch()]);
    setRefreshing(false);
  }, [home, categories, banners]);

  const approximate = point?.approximate ?? true;
  const data = home.data;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (!pickup) {
      if (banners.isError && !banners.data) out.push({ type: 'error', id: 'banners' });
      else if (banners.data && banners.data.data.length > 0) out.push({ type: 'banners', banners: banners.data.data });
      const available = data ? new Set(data.availableCategoryIds) : null;
      if (categories.isError && !categories.data) out.push({ type: 'error', id: 'categories' });
      else if (categories.data) {
        const roots = categories.data.data.filter((c) => c.active !== false && (!available || available.has(c.id) || c.children.some((k) => available.has(k.id))));
        // "Ver todas" cobre o que não cabe; sem lojas na região a linha não aparece
        if (roots.length > 0) out.push({ type: 'categories', categories: roots });
      }
    }
    if (home.isError && !data) {
      out.push({ type: 'error', id: 'home' });
      return out;
    }
    if (!data) return out;
    if (data.empty || data.nearbyStores.length === 0) {
      if (pickup) out.push({ type: 'pickup-empty' });
      else if (data.empty) out.push({ type: 'empty' });
    }
    if (data.nearbyStores.length > 0) {
      out.push({ type: 'title', id: 'nearby', title: t('home.nearbyStores'), action: 'stores' });
      openFirst(data.nearbyStores).forEach((store) => out.push({ type: 'store', store }));
    }
    if (!pickup) {
      if (data.offers.length > 0) {
        out.push({ type: 'offers', products: data.offers.map(fromProductCard) });
      }
      if (data.bestSellers.length > 0) {
        out.push({ type: 'title', id: 'best', title: t('home.bestSellers') });
        out.push({ type: 'bestsellers', products: data.bestSellers.map(fromProductCard) });
      }
      if (data.newStores.length > 0) {
        out.push({ type: 'title', id: 'new', title: t('home.newStores') });
        out.push({ type: 'new-stores', stores: data.newStores });
      }
    }
    return out;
  }, [banners.data, banners.isError, categories.data, categories.isError, data, home.isError, pickup]);

  const openBanner = (banner: Banner) => {
    const { type, id, code } = banner.destination;
    // Link só abre tela: nunca executa ação (SEC-126). Cupom abre a sacola com o código para o cliente aplicar.
    if (type === 'store' && id) router.push(`/store/${id}`);
    else if (type === 'product' && id) router.push(`/product/${id}`);
    else if (type === 'category' && id) router.push({ pathname: '/results', params: { categoryId: id, title: names.get(id) ?? banner.title } });
    else if (type === 'coupon') router.push({ pathname: '/cart', params: code ? { coupon: code } : {} });
  };

  const openStore = (id: string) => router.push(`/store/${id}`);
  const openProduct = (id: string) => router.push(`/product/${id}`);
  const seeAllStores = () => router.push({ pathname: '/results', params: { tab: 'stores', title: t('results.allStores') } });
  const modeA11y = pickup ? t('home.pickupAt') : t('home.deliverTo');

  // Cabeçalho v3 (direcao-v3.md §5 Início): bloco roxo com corte diagonal, endereço noite, título de cartaz e busca noite.
  const hero = (
    <HomeHero
      addressLabel={address ? addressLine(address) : null}
      modeLabel={modeA11y}
      onAddress={() => router.push('/addresses')}
      onSearch={() => router.push('/search')}
      topInset={insets.top}
    />
  );

  const top = (
    <View style={styles.top}>
      <Segmented
        label={t('home.modeLabel')}
        onChange={(next) => void modeStore.set(next)}
        options={[
          { value: 'delivery', label: t('home.modeDelivery'), testID: 'home.mode-delivery' },
          { value: 'pickup', label: t('home.modePickup'), testID: 'home.mode-pickup' },
        ]}
        value={mode}
      />
      <EmailVerifyBanner />
    </View>
  );

  const retry = () => {
    void home.refetch();
    void categories.refetch();
    void banners.refetch();
  };

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.type) {
      case 'banners':
        return (
          <View style={styles.block}>
            <BannerCarousel banners={item.banners} onOpen={openBanner} />
          </View>
        );
      case 'categories':
        return (
          <View style={styles.categories}>
            <CategoryRow categories={item.categories} onOpen={(c) => router.push({ pathname: '/results', params: { categoryId: c.id, title: c.name } })} />
          </View>
        );
      case 'title':
        return (
          <View style={[styles.padX, styles.titleRow]}>
            <SectionHeader
              {...(item.action ? { actionLabel: t('home.storesAll'), onAction: seeAllStores, actionTestID: 'home.stores-all' } : {})}
              title={item.title}
            />
          </View>
        );
      case 'store':
        return (
          <View style={styles.padX}>
            <StoreRow
              approximate={approximate}
              categoryName={item.store.mainCategoryId ? names.get(item.store.mainCategoryId) : undefined}
              onPress={() => openStore(item.store.id)}
              pickup={pickup}
              store={item.store}
              testID={`home.store-${item.store.id}`}
            />
          </View>
        );
      case 'offers':
        return (
          <View style={styles.band} testID="home.offers">
            <Text accessibilityRole="header" style={styles.bandTitle} variant="display">
              {t('home.offers')}
            </Text>
            <Text style={styles.bandSub} variant="body">
              {t('home.offersSub')}
            </Text>
            {item.products.length <= 3 ? (
              <OfferBento onOpen={openProduct} products={item.products} />
            ) : (
              <>
                <OfferBento onOpen={openProduct} products={item.products.slice(0, 3)} />
                <FlatList
                  contentContainerStyle={[styles.padX, styles.bandMore]}
                  data={item.products.slice(3)}
                  horizontal
                  ItemSeparatorComponent={Gap}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item: p }) => <ProductTile onPress={() => openProduct(p.id)} product={p} testID={`home.offer-${p.id}`} tone="ink" width={OFFER_TILE} />}
                  showsHorizontalScrollIndicator={false}
                />
              </>
            )}
          </View>
        );
      case 'bestsellers':
        return (
          <View style={[styles.padX, styles.bestList]}>
            {item.products.slice(0, 5).map((p, i) => (
              <Pressy
                accessibilityLabel={`${i + 1}, ${p.name}`}
                accessibilityRole="button"
                key={p.id}
                onPress={() => openProduct(p.id)}
                style={styles.best}
                testID={`home.bestseller-${p.id}`}
              >
                <Text allowFontScaling={false} style={styles.bestNumber} variant="numeralXl">
                  {i + 1}
                </Text>
                <RemoteImage height={theme.size.thumb} radius={theme.radius.lg} urls={p.urls} width={theme.size.thumb} />
                <View style={styles.bestInfo}>
                  <Text numberOfLines={2} variant="bodyStrong">
                    {p.name}
                  </Text>
                  {p.storeName ? (
                    <Text color="secondary" numberOfLines={1} variant="caption">
                      {p.storeName}
                    </Text>
                  ) : null}
                  {p.priceCents !== null ? <Money cents={p.priceCents} size="sm" /> : null}
                </View>
              </Pressy>
            ))}
          </View>
        );
      case 'new-stores': {
        const cardWidth = Math.min(screenWidth, 720) - theme.layout.screenPaddingX * 2 - theme.space[8];
        return (
          <FlatList
            contentContainerStyle={styles.padX}
            data={item.stores}
            horizontal
            ItemSeparatorComponent={Gap}
            keyExtractor={(s) => s.id}
            renderItem={({ item: s }) => (
              <StoreCoverCard
                categoryName={s.mainCategoryId ? names.get(s.mainCategoryId) : undefined}
                onPress={() => openStore(s.id)}
                store={s}
                testID={`home.new-store-${s.id}`}
                width={cardWidth}
              />
            )}
            showsHorizontalScrollIndicator={false}
          />
        );
      }
      case 'error':
        return (
          <View style={[styles.padX, styles.sectionError]} testID={`home.section-error-${item.id}`}>
            <Text color="secondary" style={styles.sectionErrorText}>
              {t('home.sectionError')}
            </Text>
            <Button label={t('home.sectionRetry')} onPress={retry} variant="text" />
          </View>
        );
      case 'empty':
        return (
          <EmptyState
            actionLabel={t('location.changeAddress')}
            icon={Storefront}
            onAction={() => router.push('/addresses')}
            testID="home.empty"
            text={t('home.emptyText')}
            title={t('home.emptyTitle')}
          />
        );
      case 'pickup-empty':
        return (
          <EmptyState
            actionLabel={t('home.pickupEmptyAction')}
            icon={Storefront}
            onAction={() => void modeStore.set('delivery')}
            testID="home.pickup-empty"
            text={t('home.pickupEmptyText')}
            title={t('home.pickupEmptyTitle')}
          />
        );
    }
  };

  const allFailed = home.isError && !home.data && categories.isError && !categories.data && banners.isError && !banners.data;
  const loading = point !== null && home.isLoading && !data;
  const [collapsed, setCollapsed] = useState(false);

  const listHeader = (
    <View>
      {hero}
      {top}
    </View>
  );

  let body;
  if (point === null || allFailed || loading) {
    let inner;
    if (point === null) {
      inner = (
        <EmptyState
          actionLabel={t('home.noPointAction')}
          onAction={() => router.push('/address/form')}
          testID="home.no-point"
          text={t('home.noPointText')}
          title={t('home.noPointTitle')}
        />
      );
    } else if (allFailed) {
      inner = !online ? (
        <ErrorState offline onRetry={retry} retryLabel={t('common.tryAgain')} testID="home.error" text={t('states.offlineText')} title={t('states.offlineTitle')} />
      ) : (
        <ErrorState onRetry={retry} retryLabel={t('common.tryAgain')} testID="home.error" text={t('states.errorText')} title={t('states.errorTitle')} />
      );
    } else {
      inner = <HomeSkeleton />;
    }
    body = (
      <ScrollView showsVerticalScrollIndicator={false}>
        {listHeader}
        {inner}
      </ScrollView>
    );
  } else {
    body = (
      <FlashList
        ListHeaderComponent={listHeader}
        data={rows}
        getItemType={(row) => row.type}
        keyExtractor={(row, i) => (row.type === 'title' ? `title-${row.id}` : row.type === 'store' ? `store-${row.store.id}` : `${row.type}-${i}`)}
        onRefresh={() => void refresh()}
        onScroll={(e) => setCollapsed(e.nativeEvent.contentOffset.y > COLLAPSE_AT)}
        ref={list}
        refreshing={refreshing}
        renderItem={renderRow}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
        testID="home.list"
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <Screen bottomInset={false} edgeToEdgeTop padded={false} scroll={false} testID="home.screen">
      <View style={styles.flex}>
        {body}
        {collapsed ? (
          <View style={[styles.compact, { paddingTop: insets.top + theme.space[2] }]} testID="home.compact">
            <Pressable accessibilityLabel={`${modeA11y} ${address ? addressLine(address) : ''}`} accessibilityRole="button" onPress={() => router.push('/addresses')} style={styles.compactAddress}>
              <MapPin color={theme.color.accent.base} size={20} weight="duotone" />
              <Text numberOfLines={1} style={styles.compactText} variant="bodyStrong">
                {address ? addressLine(address) : t('home.pickAddress')}
              </Text>
            </Pressable>
            <Pressable accessibilityLabel={t('home.searchPlaceholder')} accessibilityRole="search" onPress={() => router.push('/search')} style={styles.compactSearch}>
              <MagnifyingGlass color={theme.color.neutral[0]} size={22} weight="duotone" duo={theme.color.accent.base} />
            </Pressable>
          </View>
        ) : null}
        <MiniBag />
      </View>
    </Screen>
  );
}

const Gap = () => <View style={{ width: theme.space[3] }} />;

const COLLAPSE_AT = 250;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { gap: theme.space[3], paddingHorizontal: theme.layout.screenPaddingX, paddingTop: theme.space[3] },
  listContent: { paddingBottom: 184 },
  padX: { paddingHorizontal: theme.layout.screenPaddingX },
  block: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[6] },
  categories: { paddingBottom: theme.space[4] },
  titleRow: { paddingTop: theme.space[8], paddingBottom: theme.space[3] },
  band: { backgroundColor: theme.color.surface.ink, paddingVertical: theme.space[8], marginTop: theme.space[8], gap: theme.space[2] },
  bandTitle: { color: theme.color.neutral[0], paddingHorizontal: theme.layout.screenPaddingX },
  bandSub: { color: theme.color.text.onInkMuted, paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[3] },
  bandMore: { paddingTop: theme.space[4] },
  bestList: { gap: theme.space[2] },
  best: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: theme.size.thumb },
  bestNumber: { width: 56, textAlign: 'center', color: theme.color.brand[500] },
  bestInfo: { flex: 1, gap: theme.space[1] },
  sectionError: { paddingVertical: theme.space[3], alignItems: 'flex-start' },
  sectionErrorText: { paddingBottom: theme.space[1] },
  compact: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: theme.space[3], backgroundColor: theme.color.brand[500], paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[3] },
  compactAddress: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.color.surface.ink, borderRadius: theme.radius.control, paddingHorizontal: 12 },
  compactText: { color: theme.color.text.onInk, flexShrink: 1 },
  compactSearch: { width: 44, height: 44, borderRadius: theme.radius.control, backgroundColor: theme.color.surface.ink, alignItems: 'center', justifyContent: 'center' },
});
