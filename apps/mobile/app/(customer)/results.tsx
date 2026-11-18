import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button } from '../../src/components/Button';
import { BottomSheet } from '../../src/components/BottomSheet';
import { ArrowsDownUp, CaretLeft, MagnifyingGlass, Sliders, Storefront, X } from '../../src/components/icons';
import { IconButton } from '../../src/components/IconButton';
import { RadioListItem } from '../../src/components/RadioListItem';
import { Screen } from '../../src/components/Screen';
import { SearchBarButton } from '../../src/components/SearchBarButton';
import { Segmented } from '../../src/components/Segmented';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { fromProductCard, ProductTile } from '../../src/features/catalog/ProductTile';
import { StoreRow } from '../../src/features/catalog/StoreRow';
import { useCategoryNames, useDeliveryPoint, useProductResults, useStoreResults } from '../../src/features/catalog/queries';
import {
  activeChips,
  activeFilterCount,
  hasFilters,
  NO_FILTERS,
  PRODUCT_SORTS,
  sortLabel,
  STORE_SORTS,
  type Filters,
  type ProductSort,
  type StoreSort,
} from '../../src/features/search/filters';
import { FiltersSheet } from '../../src/features/search/FiltersSheet';
import { t } from '../../src/i18n';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

type Tab = 'products' | 'stores';
const GAP = theme.space[3];

/**
 * D7. Resultados e filtros (WB-013, 014). Entradas: busca por termo, categoria e "Ver todas" lojas.
 * Filtrar não recarrega a tela: a lista troca por cima do que está na tela (cache primeiro).
 */
export default function ResultsScreen() {
  const params = useLocalSearchParams<{ q?: string; categoryId?: string; title?: string; tab?: string }>();
  const router = useRouter();
  const online = useOnline();
  const point = useDeliveryPoint();
  const { width } = useWindowDimensions();
  const { names, tree } = useCategoryNames();
  const q = params.q?.trim() ? params.q.trim() : undefined;
  const isCategory = Boolean(params.categoryId) && !q;
  const heading = q ?? params.title ?? t('results.categoryTitle');

  const [tab, setTab] = useState<Tab>(params.tab === 'stores' ? 'stores' : 'products');
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, categoryId: params.categoryId ?? null });
  const [productSort, setProductSort] = useState<ProductSort>('relevance');
  const [storeSort, setStoreSort] = useState<StoreSort>('relevance');
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null);

  const products = useProductResults(point, q, filters, productSort, tab === 'products');
  const stores = useStoreResults(point, q, filters, storeSort, tab === 'stores');
  const active = tab === 'products' ? products : stores;

  const productItems = useMemo(() => products.data?.pages.flatMap((p) => p.data) ?? [], [products.data]);
  const storeItems = useMemo(() => stores.data?.pages.flatMap((p) => p.data) ?? [], [stores.data]);
  const count = tab === 'products' ? productItems.length : storeItems.length;
  const complete = active.data !== undefined && !active.hasNextPage;

  const columns = width >= 600 ? 3 : 2;
  const tile = Math.floor((Math.min(width, 720) - theme.layout.screenPaddingX * 2 - GAP * (columns - 1)) / columns);

  // A categoria da tela de categoria é o contexto (título), não um chip removível; quem veio de busca por termo vê o chip dela
  const chipOpts = { withCategory: !isCategory };
  const chips = activeChips(filters, (id) => names.get(id), chipOpts);
  const filterCount = activeFilterCount(filters, chipOpts);
  const sortValue = tab === 'products' ? productSort : storeSort;
  const sorts = tab === 'products' ? PRODUCT_SORTS : STORE_SORTS;

  const clearFilters = () => setFilters({ ...NO_FILTERS, categoryId: isCategory ? (params.categoryId ?? null) : null });

  const header = (
    <View style={styles.header}>
      <IconButton icon={CaretLeft} label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="header.back" />
      <View style={styles.flex}>
        <SearchBarButton onPress={() => router.push('/search')} placeholder={t('search.placeholder')} testID="results.search-bar" value={q ?? (isCategory ? heading : undefined)} />
      </View>
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      <View style={styles.padX}>
        <Segmented
          label={heading}
          onChange={setTab}
          options={[
            { value: 'products', label: tab === 'products' && complete ? `${t('results.tabProducts')} (${productItems.length})` : t('results.tabProducts'), testID: 'results.tab-products' },
            { value: 'stores', label: tab === 'stores' && complete ? `${t('results.tabStores')} (${storeItems.length})` : t('results.tabStores'), testID: 'results.tab-stores' },
          ]}
          value={tab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.chipRow} horizontal showsHorizontalScrollIndicator={false}>
        <ChipButton
          accessibilityLabel={t('results.filtersA11y', { n: filterCount })}
          icon={Sliders}
          label={filterCount > 0 ? t('results.filtersCount', { n: filterCount }) : t('results.filters')}
          onPress={() => setSheet('filters')}
          selected={filterCount > 0}
          testID="results.filters"
        />
        <ChipButton icon={ArrowsDownUp} label={t('results.sort', { label: sortLabel(sortValue) })} onPress={() => setSheet('sort')} testID="results.sort" />
        {chips.map((chip) => (
          <ChipButton
            accessibilityLabel={t('results.removeFilter', { name: chip.label })}
            icon={X}
            key={chip.id}
            label={chip.label}
            onPress={() => setFilters((f) => chip.remove(f))}
            selected
            testID={`results.chip-${chip.id}`}
            trailing
          />
        ))}
      </ScrollView>
    </View>
  );

  const onEnd = () => {
    if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
  };

  const footer = active.isFetchingNextPage ? (
    <View style={styles.footerLoading}>
      <Skeleton height={tile} width={tile} />
      <Skeleton height={tile} width={tile} />
    </View>
  ) : active.isFetchNextPageError ? (
    <View style={styles.footerLoading}>
      <Text color="secondary">{t('results.loadMoreError')}</Text>
      <Button label={t('common.tryAgain')} onPress={() => void active.fetchNextPage()} variant="text" />
    </View>
  ) : null;

  let body;
  if (point === null) {
    body = (
      <EmptyState actionLabel={t('results.needAddressAction')} icon={Storefront} onAction={() => router.push('/addresses')} testID="results.no-point" text={t('results.needAddressText')} title={t('results.needAddressTitle')} />
    );
  } else if (active.isLoading) {
    body =
      tab === 'products' ? (
        <View accessibilityLabel={t('common.loading')} style={styles.skeletonGrid} testID="results.skeleton">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ gap: theme.space[2] }}>
              <Skeleton height={tile} width={tile} />
              <Skeleton height={14} width={tile * 0.7} />
            </View>
          ))}
        </View>
      ) : (
        <View accessibilityLabel={t('common.loading')} style={styles.padX} testID="results.skeleton">
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton height={56} width={56} />
              <View style={styles.flex}>
                <Skeleton height={16} width="60%" />
                <Skeleton height={12} width="80%" style={{ marginTop: theme.space[2] }} />
              </View>
            </View>
          ))}
        </View>
      );
  } else if (active.isError && !active.data) {
    body = !online ? (
      <ErrorState offline onRetry={() => void active.refetch()} retryLabel={t('common.tryAgain')} testID="results.error" text={t('search.offline')} title={t('states.offlineTitle')} />
    ) : (
      <ErrorState onRetry={() => void active.refetch()} retryLabel={t('common.tryAgain')} testID="results.error" text={t('states.errorText')} title={t('states.errorTitle')} />
    );
  } else if (count === 0) {
    const filtered = hasFilters({ ...filters, categoryId: isCategory ? null : filters.categoryId });
    body = (
      <View>
        <EmptyState
          actionLabel={filtered ? t('results.clearFilters') : tab === 'products' ? t('results.seeStores') : t('results.clearFilters')}
          icon={MagnifyingGlass}
          onAction={() => (filtered ? clearFilters() : tab === 'products' ? setTab('stores') : router.replace('/'))}
          testID="results.empty"
          text={filtered ? undefined : t('results.emptyText')}
          title={filtered ? t('results.emptyFilteredTitle') : q ? t('results.emptyTitle', { q }) : t('results.emptyCategoryTitle', { q: heading })}
        />
        {!filtered && tree.length > 0 ? (
          <View style={[styles.padX, styles.suggested]}>
            <Text accessibilityRole="header" variant="bodyStrong">
              {t('results.suggestedCategories')}
            </Text>
            <View style={styles.suggestedRow}>
              {tree.slice(0, 6).map((c) => (
                <Button key={c.id} label={c.name} onPress={() => router.replace({ pathname: '/results', params: { categoryId: c.id, title: c.name } })} variant="secondary" />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  } else if (tab === 'products') {
    body = (
      <FlashList
        contentContainerStyle={styles.listPad}
        data={productItems}
        key={`products-${columns}`}
        keyExtractor={(p) => p.id}
        ListFooterComponent={footer}
        numColumns={columns}
        onEndReached={onEnd}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <ProductTile onPress={() => router.push(`/product/${item.id}`)} product={fromProductCard(item)} testID={`results.product-${item.id}`} width={tile} />
          </View>
        )}
        testID="results.list"
      />
    );
  } else {
    body = (
      <FlashList
        contentContainerStyle={styles.listPad}
        data={storeItems}
        key="stores"
        keyExtractor={(s) => s.id}
        ListFooterComponent={footer}
        numColumns={width >= 600 ? 2 : 1}
        onEndReached={onEnd}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <StoreRow
            approximate={point?.approximate ?? true}
            categoryName={item.mainCategoryId ? names.get(item.mainCategoryId) : undefined}
            onPress={() => router.push(`/store/${item.id}`)}
            store={item}
            testID={`results.store-${item.id}`}
          />
        )}
        testID="results.list"
      />
    );
  }

  return (
    <Screen header={header} padded={false} scroll={false} testID="results.screen">
      {controls}
      <View accessibilityLiveRegion="polite" style={styles.flex}>
        {body}
      </View>
      <FiltersSheet
        categories={tree}
        filters={filters}
        forStores={tab === 'stores'}
        hideCategory={isCategory}
        onApply={(next) => {
          setFilters(next);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
        visible={sheet === 'filters'}
      />
      <BottomSheet onClose={() => setSheet(null)} testID="sort.sheet" title={t('results.sortTitle')} visible={sheet === 'sort'}>
        {sorts.map((s) => (
          <RadioListItem
            key={s}
            onPress={() => {
              if (tab === 'products') setProductSort(s as ProductSort);
              else setStoreSort(s as StoreSort);
              setSheet(null);
            }}
            selected={sortValue === s}
            testID={`sort.option-${s}`}
            title={sortLabel(s)}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}

function ChipButton({ label, icon: Icon, onPress, selected, trailing, accessibilityLabel, testID }: { label: string; icon: typeof X; onPress: () => void; selected?: boolean; trailing?: boolean; accessibilityLabel?: string; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      hitSlop={theme.space[1]}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, trailing && styles.chipTrailing]}
      testID={testID}
    >
      {!trailing ? <Icon color={selected ? theme.color.text.brand : theme.color.text.primary} size={theme.size.iconSm} /> : null}
      <Text color={selected ? 'brand' : 'primary'} variant="bodyStrong">
        {label}
      </Text>
      {trailing ? <Icon color={theme.color.text.brand} size={theme.size.iconSm} weight="bold" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1], paddingRight: theme.layout.screenPaddingX, paddingLeft: theme.space[1], minHeight: theme.size.headerHeight },
  padX: { paddingHorizontal: theme.layout.screenPaddingX },
  controls: { gap: theme.space[2], paddingBottom: theme.space[2] },
  chipRow: { gap: theme.space[2], paddingHorizontal: theme.layout.screenPaddingX, alignItems: 'center' },
  chip: { minHeight: theme.size.controlSm, flexDirection: 'row', alignItems: 'center', gap: theme.space[1], paddingHorizontal: theme.space[4], borderRadius: theme.radius.full, backgroundColor: theme.color.surface.sunken, borderWidth: theme.borderWidth.strong, borderColor: 'transparent' },
  chipSelected: { backgroundColor: theme.color.surface.brandSubtle, borderColor: theme.color.border.focus },
  chipTrailing: { paddingRight: theme.space[3] },
  listPad: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[8] },
  cell: { paddingBottom: theme.space[4], alignItems: 'center' },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: theme.layout.screenPaddingX },
  skeletonRow: { flexDirection: 'row', gap: theme.space[3], paddingVertical: theme.space[3] },
  footerLoading: { flexDirection: 'row', gap: GAP, paddingVertical: theme.space[3], alignItems: 'center' },
  suggested: { gap: theme.space[2] },
  suggestedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
});
