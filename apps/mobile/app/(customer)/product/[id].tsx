import { useQueryClient } from '@tanstack/react-query';
import type { BrowseProduct, BrowseVariant } from '@webag/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { fetchProduct } from '../../../src/api/catalog-api';
import { ApiError } from '../../../src/api/problem';
import { Badge } from '../../../src/components/Badge';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { Dialog } from '../../../src/components/Dialog';
import { ArrowsClockwise, CaretLeft, CaretRight, Heart, Package, Star, Storefront, Warning, X } from '../../../src/components/icons';
import { IconButton } from '../../../src/components/IconButton';
import { QuantityStepper } from '../../../src/components/QuantityStepper';
import { RemoteImage } from '../../../src/components/RemoteImage';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { closedLabel, formatRating, ratingA11y } from '../../../src/features/catalog/format';
import { Price } from '../../../src/features/catalog/Price';
import { useProductQuery, useReviewsQuery, useStoreQuery, useDeliveryPoint } from '../../../src/features/catalog/queries';
import { ReviewItem } from '../../../src/features/catalog/ReviewItem';
import { buildGroups, findVariant, missingAttributes, selectOption, shownPrice, variantLabel, type Selection } from '../../../src/features/catalog/variants';
import { cartActions, type NewItem } from '../../../src/features/cart/store';
import { ExchangePolicySheet } from '../../../src/features/catalog/StoreSheets';
import { useApplyPendingFavorite, useFavorite } from '../../../src/features/favorites/hooks';
import { t } from '../../../src/i18n';
import { formatMoney } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

/** Sem estoque por produto na API para itens sem variação: teto de quantidade do app. [HIPÓTESE] ver pendencias-contrato-mobile.md */
const DEFAULT_MAX_QTY = 10;

/** D9. Produto (WB-017): galeria, preço e promoção, variações com estoque, trocas, avaliações e adicionar à sacola. */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const client = useQueryClient();
  const point = useDeliveryPoint();
  const query = useProductQuery(id);
  const product = query.data;
  const store = useStoreQuery(product?.store.id, point);
  const reviews = useReviewsQuery('product', id);
  const favorite = useFavorite('product', id, product?.name ?? '');
  useApplyPendingFavorite(favorite.applyPending, Boolean(product));
  const { width } = useWindowDimensions();

  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [errorGroups, setErrorGroups] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [conflict, setConflict] = useState<{ item: NewItem; storeName: string; currentStoreName: string; itemCount: number } | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const variantsY = useRef(0);

  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <Screen header={<TopBar />}>
        <EmptyState actionLabel={t('product.seeOthers')} icon={Package} onAction={() => router.replace('/')} testID="product.not-found" text={t('product.notFoundText')} title={t('product.notFoundTitle')} />
      </Screen>
    );
  }
  if (query.isError && !product) {
    return (
      <Screen header={<TopBar />}>
        <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="product.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  if (!product) {
    return (
      <Screen header={<TopBar />} testID="product.skeleton">
        <Skeleton height={Math.min(width, 480)} />
        <Skeleton height={28} width="40%" />
        <Skeleton height={20} />
        <Skeleton height={20} width="70%" />
        <View style={styles.row}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton height={48} key={i} radius={theme.radius.full} width={64} />
          ))}
        </View>
      </Screen>
    );
  }

  const variants = product.variants ?? [];
  const attributes = product.variantAttributes ?? [];
  const hasVariants = variants.length > 0 && attributes.length > 0;
  const groups = hasVariants ? buildGroups(attributes, variants, selection) : [];
  const selected = hasVariants ? findVariant(attributes, variants, selection) : undefined;
  const price = shownPrice(product, variants, selected);
  const allSoldOut = !product.available || (hasVariants && variants.every((v) => !v.available));
  const maxQty = selected ? Math.max(1, selected.maxQuantity) : hasVariants ? DEFAULT_MAX_QTY : DEFAULT_MAX_QTY;
  const qty = Math.min(quantity, maxQty);
  const storeOpen = product.store.open;
  const exchangeDays = store.data?.exchangePolicy.voluntaryDays ?? 0;
  const images = [...(product.images ?? [])].sort((a, b) => a.position - b.position);
  const stockWarning = selected?.lastUnits ? (selected.lastUnits === 1 ? t('product.lastUnit') : t('product.lastUnits', { n: selected.lastUnits })) : null;
  const atMax = qty >= maxQty && Boolean(selected);
  const description = product.description ?? '';

  const onChoose = (name: string, value: string) => {
    setSelection((prev) => selectOption(attributes, variants, prev, name, value));
    setErrorGroups((prev) => prev.filter((g) => g !== name));
    setAdded(false);
  };

  const buildItem = (v: BrowseVariant | undefined, current: BrowseProduct): NewItem => {
    const unit = v ? v.price.amount : (current.price?.amount ?? 0);
    const original = v ? (v.originalPrice?.amount ?? null) : (current.originalPrice?.amount ?? null);
    return {
      productId: current.id,
      variantId: v?.id ?? null,
      name: current.name,
      variantLabel: v ? variantLabel(attributes, selection) : null,
      urls: images[0]?.urls ?? {},
      unitPriceCents: unit,
      originalPriceCents: original,
      quantity: qty,
      maxQuantity: v ? Math.max(1, v.maxQuantity) : DEFAULT_MAX_QTY,
    };
  };

  const onAdd = async () => {
    if (adding) return;
    if (hasVariants) {
      const missing = missingAttributes(attributes, selection);
      if (missing.length > 0) {
        // botão sempre ativo: leva ao grupo e explica (D9 C3); nunca desabilitado sem motivo
        setErrorGroups(missing);
        void haptic('error');
        scroller.current?.scrollTo({ y: Math.max(0, variantsY.current - theme.space[4]), animated: true });
        return;
      }
    }
    setAdding(true);
    try {
      // Confere preço e estoque na hora de adicionar; sem rede segue com o que a tela mostra e avisa (D9 Offline)
      let fresh: BrowseProduct = product;
      let checked = false;
      if (online) {
        try {
          fresh = await fetchProduct(product.id);
          checked = true;
          client.setQueryData(['product', product.id], fresh);
        } catch {
          checked = false;
        }
      }
      const freshVariants = fresh.variants ?? [];
      const variant = hasVariants ? findVariant(attributes, freshVariants, selection) : undefined;
      if (checked && (!fresh.available || (hasVariants && !variant?.available))) {
        void haptic('error');
        toast.show(t('cart.warnSoldOut'));
        return;
      }
      const item = buildItem(variant ?? selected, fresh);
      const shownCents = selected ? selected.price.amount : (product.price?.amount ?? item.unitPriceCents);
      const result = await cartActions.add(product.store.id, product.store.name, item);
      if (result.kind === 'store-conflict') {
        setConflict({ item, storeName: product.store.name, currentStoreName: result.currentStoreName, itemCount: result.itemCount });
        return;
      }
      void haptic('light');
      setAdded(true);
      setTimeout(() => setAdded(false), 2_000);
      if (checked && item.unitPriceCents !== shownCents) toast.show(t('product.promoEnded', { price: formatMoney(item.unitPriceCents) }), { label: t('product.viewBag'), onPress: () => router.push('/cart') });
      else toast.show(online ? t('product.addedToast') : t('product.addedOffline'), { label: t('product.viewBag'), onPress: () => router.push('/cart') });
    } finally {
      setAdding(false);
    }
  };

  const confirmSwitch = async () => {
    if (!conflict) return;
    const c = conflict;
    setConflict(null);
    await cartActions.replaceWith(product.store.id, c.storeName, c.item);
    void haptic('success');
    toast.show(t('cart.switchDone'), { label: t('product.viewBag'), onPress: () => router.push('/cart') });
  };

  const favoriteLabel = favorite.isFavorite ? t('product.unfavorite', { name: product.name }) : t('product.favorite', { name: product.name });
  const addLabel = added ? t('product.added') : price ? t('product.add', { price: formatMoney(price.cents * qty) }) : t('product.viewBag');

  return (
    <Screen
      footer={
        allSoldOut ? (
          <Button label={t('product.seeOthers')} onPress={() => router.push(`/store/${product.store.id}`)} size="lg" testID="product.see-others" />
        ) : (
          <View style={styles.bar}>
            <QuantityStepper max={maxQty} onChange={setQuantity} testID="product.qty" value={qty} />
            <Button label={addLabel} loading={adding} onPress={() => void onAdd()} size="lg" style={styles.addButton} testID="product.add" />
          </View>
        )
      }
      padded={false}
      scroll={false}
      testID="product.screen"
    >
      <ScrollView ref={scroller} showsVerticalScrollIndicator={false}>
        <Gallery images={images} name={product.name} width={Math.min(width, 480)} />
        <View style={[styles.floating, styles.floatingLeft]}>
          <IconButton icon={CaretLeft} label={t('store.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} overPhoto testID="product.back" />
        </View>
        <View style={[styles.floating, styles.floatingRight]}>
          <IconButton
            color={favorite.isFavorite ? theme.color.feedback.danger.base : theme.color.text.primary}
            icon={Heart}
            label={favoriteLabel}
            onPress={favorite.toggle}
            overPhoto
            testID="product.favorite"
            weight={favorite.isFavorite ? 'fill' : 'regular'}
          />
        </View>

        <View style={styles.body}>
          {allSoldOut ? (
            <Badge label={t('product.allSoldOut')} testID="product.sold-out" />
          ) : price ? (
            <Price cents={price.cents} discountPercent={price.discountPercent} from={price.from} originalCents={price.originalCents} size="display" testID="product.price" />
          ) : null}
          <Text accessibilityRole="header" numberOfLines={2} variant="title2">
            {product.name}
          </Text>
          {product.rating ? (
            <View accessible accessibilityLabel={ratingA11y(product.rating)} style={styles.ratingRow}>
              <Star color={theme.color.rating.star} size={16} weight="fill" />
              <Text variant="caption">{formatRating(product.rating)}</Text>
            </View>
          ) : null}

          {!storeOpen ? <Banner testID="product.closed-banner" text={t('store.closedBanner', { label: closedLabel(product.store.opensAt) })} tone="info" /> : null}

          {hasVariants && !allSoldOut ? (
            <View onLayout={(e) => (variantsY.current = e.nativeEvent.layout.y)} style={styles.variants}>
              {groups.map((group) => {
                const failed = errorGroups.includes(group.name);
                return (
                  <View accessibilityLabel={group.name} accessibilityRole="radiogroup" key={group.name} style={styles.group} testID={`product.group-${group.name}`}>
                    <Text variant="captionStrong">{selection[group.name] ? `${group.name}: ${selection[group.name]}` : group.name}</Text>
                    <View style={[styles.optionRow, failed && styles.optionRowError]}>
                      {group.options.map((option) => {
                        const isSelected = selection[group.name] === option.value;
                        return (
                          <Pressable
                            accessibilityLabel={option.available ? option.value : t('product.variantSoldOut', { value: option.value })}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: isSelected, selected: isSelected, disabled: !option.available }}
                            disabled={!option.available}
                            key={option.value}
                            onPress={() => {
                              void haptic('selection');
                              onChoose(group.name, option.value);
                            }}
                            style={[styles.option, isSelected && styles.optionSelected, !option.available && styles.optionOff]}
                            testID={`product.variant-${group.name}-${option.value}`}
                          >
                            <Text color={isSelected ? 'brand' : option.available ? 'primary' : 'disabled'} style={!option.available && styles.struck} variant="label">
                              {option.value}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {failed ? (
                      <Text accessibilityLiveRegion="polite" color="danger" testID="product.variant-error" variant="caption">
                        {t('product.variantChoose', { name: group.name })}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {stockWarning ? (
            <View style={styles.inline} testID="product.stock-warning">
              <Warning color={theme.color.feedback.warning.base} size={theme.size.iconSm} weight="fill" />
              <Text color="warning" variant="label">
                {stockWarning}
              </Text>
            </View>
          ) : null}
          {atMax ? (
            <Text color="danger" variant="caption">
              {t('product.qtyMax', { n: maxQty })}
            </Text>
          ) : null}

          {store.data ? (
            <Pressable accessibilityRole="button" onPress={() => setExchangeOpen(true)} style={styles.inline} testID="product.exchange">
              <ArrowsClockwise color={theme.color.text.brand} size={theme.size.iconMd} />
              <Text color="brand" style={styles.flex} variant="label">
                {exchangeDays > 0 ? t('product.exchange', { days: exchangeDays }) : t('product.exchangeNo')}
              </Text>
            </Pressable>
          ) : null}

          <Pressable accessibilityLabel={`${t('product.seeStore')}, ${product.store.name}`} accessibilityRole="button" onPress={() => router.push(`/store/${product.store.id}`)} style={styles.storeRow} testID="product.store">
            {store.data ? <RemoteImage height={40} radius={theme.radius.md} urls={store.data.logo.urls} width={40} /> : <Storefront color={theme.color.text.secondary} size={theme.size.iconMd} />}
            <Text style={styles.flex} variant="bodyStrong">
              {product.store.name}
            </Text>
            <Text color="link" variant="label">
              {t('product.seeStore')}
            </Text>
            <CaretRight color={theme.color.text.secondary} size={theme.size.iconSm} />
          </Pressable>

          {description ? (
            <View style={styles.description}>
              <Text numberOfLines={expanded ? undefined : 3}>{description}</Text>
              {description.length > 140 ? (
                <Button label={expanded ? t('product.descriptionLess') : t('product.descriptionMore')} onPress={() => setExpanded((e) => !e)} testID="product.description-more" variant="text" />
              ) : null}
            </View>
          ) : null}

          <ReviewsPreview
            count={product.rating?.count ?? 0}
            loading={reviews.isLoading}
            onAll={() => router.push({ pathname: '/reviews', params: { kind: 'product', id: product.id, name: product.name } })}
            reviews={reviews.data?.pages[0]?.data.slice(0, 3) ?? []}
          />
          {!storeOpen && !allSoldOut ? (
            <Button label={t('product.seeStoreProducts')} onPress={() => router.push(`/store/${product.store.id}`)} variant="text" />
          ) : null}
        </View>
      </ScrollView>

      {store.data ? <ExchangePolicySheet onClose={() => setExchangeOpen(false)} store={store.data} visible={exchangeOpen} /> : null}
      <Dialog
        onClose={() => setConflict(null)}
        testID="cart.switch-dialog"
        text={conflict ? t('cart.switchText', { count: conflict.itemCount, noun: conflict.itemCount === 1 ? t('cart.itemOne') : t('cart.itemMany'), store: conflict.currentStoreName }) : ''}
        title={t('cart.switchTitle')}
        visible={conflict !== null}
      >
        <Button label={t('cart.switchKeep')} onPress={() => setConflict(null)} testID="cart.switch-keep" />
        <Button label={t('cart.switchClear')} onPress={() => void confirmSwitch()} testID="cart.switch-clear" variant="destructive" />
      </Dialog>
    </Screen>
  );
}

function TopBar() {
  const router = useRouter();
  return (
    <View style={styles.topBar}>
      <IconButton icon={CaretLeft} label={t('store.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="product.back" />
    </View>
  );
}

function ReviewsPreview({ reviews, count, loading, onAll }: { reviews: import('@webag/shared').Review[]; count: number; loading: boolean; onAll: () => void }) {
  return (
    <View style={styles.reviews}>
      <Text accessibilityRole="header" variant="title2">
        {t('product.reviews')}
      </Text>
      {loading ? <Skeleton height={56} /> : null}
      {!loading && reviews.length === 0 ? <Text color="secondary">{t('product.reviewsNone')}</Text> : null}
      {reviews.map((r) => (
        <ReviewItem key={r.id} review={r} />
      ))}
      {count > 0 ? <Button label={t('product.reviewsAll', { n: count })} onPress={onAll} testID="product.reviews-all" variant="secondary" /> : null}
    </View>
  );
}

/** Galeria 1:1 (deslizar; contador "2/5"; toque abre tela cheia). Setas para quem não usa gesto. */
function Gallery({ images, name, width }: { images: { id: string; urls: Record<string, string> }[]; name: string; width: number }) {
  const list = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const { width: screen, height } = useWindowDimensions();
  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    list.current?.scrollToOffset({ offset: clamped * width, animated: true });
    setIndex(clamped);
  };
  if (images.length === 0) return <RemoteImage alt={t('catalog.imageAlt', { name })} aspectRatio={1} radius={0} urls={undefined} width={width} />;
  return (
    <View testID="product.gallery">
      <FlatList
        data={images}
        decelerationRate="fast"
        horizontal
        keyExtractor={(i) => i.id}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        pagingEnabled
        ref={list}
        renderItem={({ item, index: i }) => (
          <Pressable accessibilityLabel={`${t('product.gallery', { n: i + 1, total: images.length })}. ${t('product.galleryOpen')}`} accessibilityRole="imagebutton" onPress={() => setFull(true)} style={{ width }}>
            <RemoteImage alt={name} aspectRatio={1} priority={i === 0 ? 'high' : 'normal'} radius={0} urls={item.urls} width={width} />
          </Pressable>
        )}
        showsHorizontalScrollIndicator={false}
      />
      {images.length > 1 ? (
        <View style={styles.counter}>
          <Text color="onBrand" variant="micro">
            {index + 1}/{images.length}
          </Text>
        </View>
      ) : null}
      {images.length > 1 ? (
        <View pointerEvents="box-none" style={styles.arrows}>
          <IconButton disabled={index === 0} icon={CaretLeft} label={t('product.galleryPrev')} onPress={() => go(index - 1)} overPhoto testID="product.gallery-prev" />
          <IconButton disabled={index === images.length - 1} icon={CaretRight} label={t('product.galleryNext')} onPress={() => go(index + 1)} overPhoto testID="product.gallery-next" />
        </View>
      ) : null}
      <Modal animationType="fade" onRequestClose={() => setFull(false)} statusBarTranslucent visible={full}>
        <View style={styles.fullscreen} testID="product.gallery-fullscreen">
          <ScrollView
            centerContent
            contentContainerStyle={styles.fullContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            // zoom por pinça: nativo no iOS; no Android depende de gesture-handler (pendência registrada)
            pinchGestureEnabled
          >
            <RemoteImage alt={t('product.gallery', { n: index + 1, total: images.length })} aspectRatio={1} radius={0} urls={images[index]?.urls} width={Math.min(screen, height)} />
          </ScrollView>
          <View style={styles.fullClose}>
            <IconButton icon={X} label={t('product.galleryClose')} onPress={() => setFull(false)} overPhoto testID="product.gallery-close" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { minHeight: theme.size.headerHeight, justifyContent: 'center', paddingHorizontal: theme.space[1] },
  floating: { position: 'absolute', top: theme.space[2] },
  floatingLeft: { left: theme.space[2] },
  floatingRight: { right: theme.space[2] },
  body: { padding: theme.layout.screenPaddingX, gap: theme.space[3], maxWidth: theme.layout.formMaxWidth + theme.space[8], width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: theme.space[2] },
  flex: { flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] },
  variants: { gap: theme.space[4] },
  group: { gap: theme.space[2] },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2], padding: 2, borderRadius: theme.radius.md, borderWidth: theme.borderWidth.strong, borderColor: 'transparent' },
  optionRowError: { borderColor: theme.color.border.danger },
  option: { minHeight: theme.size.touchMin, minWidth: theme.size.touchMin, paddingHorizontal: theme.space[4], alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.full, borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.strong, backgroundColor: theme.color.surface.card },
  optionSelected: { borderWidth: theme.borderWidth.strong, borderColor: theme.color.border.focus, backgroundColor: theme.color.surface.brandSubtle },
  optionOff: { opacity: theme.opacity.disabled + 0.3 },
  struck: { textDecorationLine: 'line-through' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], minHeight: theme.size.touchMin },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: theme.size.touchMin + theme.space[2], paddingVertical: theme.space[2], borderTopWidth: theme.borderWidth.hairline, borderBottomWidth: theme.borderWidth.hairline, borderColor: theme.color.border.subtle },
  description: { gap: theme.space[1], alignItems: 'flex-start' },
  reviews: { gap: theme.space[3] },
  bar: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3] },
  addButton: { flex: 1 },
  counter: { position: 'absolute', right: theme.space[3], bottom: theme.space[3], backgroundColor: theme.color.overlay.scrim, borderRadius: theme.radius.full, paddingHorizontal: theme.space[3], paddingVertical: theme.space[1] },
  arrows: { position: 'absolute', left: theme.space[2], right: theme.space[2], top: '40%', flexDirection: 'row', justifyContent: 'space-between' },
  fullscreen: { flex: 1, backgroundColor: theme.color.surface.inverse, justifyContent: 'center' },
  fullContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  fullClose: { position: 'absolute', top: theme.space[10], right: theme.space[2] },
});
