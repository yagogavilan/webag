import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ApiError } from '../../src/api/problem';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Plus } from '../../src/components/icons';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { etaLabel } from '../../src/features/catalog/eta';
import { PairWith } from '../../src/features/cart/PairWith';
import { modeStore } from '../../src/features/catalog/queries';
import { CartLineItem } from '../../src/features/cart/CartLineItem';
import { CouponSection } from '../../src/features/cart/CouponSection';
import { useCartActions, useCartView } from '../../src/features/cart/hooks';
import type { CartLine, CartView } from '../../src/features/cart/model';
import { PriceSummary } from '../../src/features/cart/PriceSummary';
import { MaintenanceBanner } from '../../src/features/maintenance/MaintenanceBanner';
import { couponErrorMessage, deriveCta, firstBlockedIndex, hasAcknowledgeable } from '../../src/features/cart/state';
import { t } from '../../src/i18n';
import { formatMoney } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/** S1. Sacola (WB-020, 021, 022): conferir o que vai comprar e ver o total sem surpresa. Uma loja por pedido; o total é o do servidor. */
export default function CartScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const cart = useCartView();
  const actions = useCartActions();
  const mode = modeStore.useValue();
  const list = useRef<FlashListRef<CartLine>>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState<Record<string, number>>({});
  const [accepting, setAccepting] = useState(false);
  const view = cart.view;

  /** Escritas em fila: a última quantidade tocada vence e uma resposta atrasada não desfaz a outra (rede ruim). */
  const enqueue = useCallback(
    (job: () => Promise<void>) => {
      queue.current = queue.current.then(job).catch((error: unknown) => {
        void haptic('error');
        toast.show(error instanceof ApiError && error.isConnectivity ? t('cart.editOffline') : t('cart.editError'));
      });
    },
    [toast],
  );

  const onQuantity = useCallback(
    (line: CartLine, quantity: number) => {
      setPending((p) => ({ ...p, [line.key]: quantity }));
      enqueue(async () => {
        try {
          await actions.setQuantity(line, quantity);
        } finally {
          setPending((p) => {
            if (p[line.key] !== quantity) return p;
            const { [line.key]: _done, ...rest } = p;
            return rest;
          });
        }
      });
    },
    [actions, enqueue],
  );

  const onRemove = useCallback(
    (line: CartLine) => {
      if (!view) return;
      enqueue(async () => {
        await actions.remove(line);
        toast.show(t('cart.removed', { name: line.name }), {
          label: t('cart.undo'),
          onPress: () => enqueue(() => actions.restore(view, line)),
        });
      });
    },
    [actions, enqueue, toast, view],
  );

  const onApplyCoupon = useCallback(
    async (code: string): Promise<string | null> => {
      try {
        const next = await actions.applyCoupon(code);
        void haptic('success');
        toast.show(t('cart.couponApplied', { value: formatMoney(next.summary.discount.amount) }));
        return null;
      } catch (error) {
        void haptic('error');
        return couponErrorMessage(error);
      }
    },
    [actions, toast],
  );

  const onRemoveCoupon = useCallback(async () => {
    try {
      await actions.removeCoupon();
    } catch {
      toast.show(t('cart.editError'));
    }
  }, [actions, toast]);

  const goLogin = () => router.push({ pathname: '/signup', params: { returnTo: '/checkout', context: 'checkout' } });

  const header = <Header large title={t('cart.title')} />;

  if (cart.isLoading) {
    return (
      <Screen header={header} testID="cart.skeleton">
        <Skeleton height={40} width="60%" />
        {[0, 1, 2].map((i) => (
          <Skeleton height={72} key={i} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton height={20} key={`s${i}`} />
        ))}
      </Screen>
    );
  }
  if (cart.isError) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={cart.refetch} retryLabel={t('common.tryAgain')} testID="cart.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  if (!view) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('cart.emptyAction')} art="bag" onAction={() => router.replace('/')} testID="cart.empty" text={t('cart.emptyText')} title={t('cart.emptyTitle')} />
      </Screen>
    );
  }

  const cta = deriveCta(view);
  const summary = view.summary;
  const changes = hasAcknowledgeable(view.lines);

  const onSubmit = () => {
    if (!cart.authed) return goLogin();
    if (!online) {
      toast.show(t('cart.payOffline'));
      return;
    }
    switch (cta.kind) {
      case 'closed':
        return;
      case 'logistics-closed':
        // quem escolhe é o cliente: leva à troca de endereço/modo (Início tem Entrega x Retirada), sem trocar nada sozinho
        return router.push('/');
      case 'add-more':
        return router.push(`/store/${view.storeId}`);
      case 'change-address':
        return router.push('/addresses');
      case 'sold-out': {
        const index = firstBlockedIndex(view.lines);
        if (index >= 0) void list.current?.scrollToIndex({ index, animated: true });
        void haptic('error');
        toast.show(t('cart.soldOutBlock'));
        return;
      }
      case 'remove-items':
        void haptic('error');
        toast.show(t('cart.aboveMax'));
        return;
      case 'pay':
        if (changes) {
          void haptic('error');
          toast.show(t('cart.changed'));
          return;
        }
        // Sacola pagável e sem mudança pendente: o checkout confirma o total no servidor (PIX, cartão e retirada).
        return router.push('/checkout');
    }
  };

  const onAccept = async () => {
    setAccepting(true);
    try {
      await actions.acknowledge();
      void haptic('success');
    } catch {
      toast.show(t('cart.editError'));
    } finally {
      setAccepting(false);
    }
  };

  const totalCents = summary ? summary.totalCents : view.subtotalCents;
  const total = formatMoney(totalCents);
  const footer = (
    <View style={styles.footer}>
      <MaintenanceBanner testID="cart.maintenance-banner" />
      {cta.banner ? <Banner testID={cta.banner.testID} text={cta.banner.text} tone={cta.banner.tone} /> : null}
      <View accessible accessibilityLabel={t('cart.totalA11y', { value: total })} style={styles.footerTotal}>
        <Text variant="bodyStrong">{summary ? t('cart.total') : t('cart.visitorTotal')}</Text>
        <Text testID="cart.total" variant="priceStrong">
          {total}
        </Text>
      </View>
      <Button
        disabled={cta.inert}
        label={cta.label}
        onPress={onSubmit}
        size="lg"
        testID="cart.submit"
        {...(cta.kind === 'closed' ? { accessibilityHint: t('cart.closedBanner') } : {})}
      />
    </View>
  );

  return (
    <Screen footer={footer} header={header} padded={false} scroll={false} testID="cart.screen">
      <FlashList
        contentContainerStyle={styles.content}
        data={view.lines}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(l) => l.key}
        ListFooterComponent={
          <View>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/store/${view.storeId}`)} style={styles.addMore} testID="cart.add-more">
              <Plus color={theme.color.text.link} size={theme.size.iconSm} />
              <Text color="link" variant="label">
                {t('cart.addMore')}
              </Text>
            </Pressable>
            <PairWith excludeProductIds={view.lines.map((l) => l.productId)} onOpen={(id) => router.push(`/product/${id}`)} storeId={view.storeId} />
            <CouponSection coupon={view.coupon} discountCents={summary?.discountCents ?? 0} guest={!cart.authed} onApply={onApplyCoupon} onGuest={goLogin} online={online} onRemove={onRemoveCoupon} />
            {summary ? <PriceSummary couponCode={view.coupon?.applied ? view.coupon.code : undefined} pickup={mode === 'pickup'} summary={summary} /> : <VisitorSummary subtotalCents={view.subtotalCents} />}
          </View>
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <StoreHeader onOpen={() => router.push(`/store/${view.storeId}`)} view={view} />
            {cart.checkFailed ? <Banner testID="cart.check-error" text={t('cart.checkError')} tone="warning" /> : null}
            {changes ? <Banner actionLabel={accepting ? t('common.loading') : t('cart.acknowledge')} onAction={() => void onAccept()} testID="cart.changes" text={t('cart.changed')} tone="info" /> : null}
          </View>
        }
        ref={list}
        renderItem={({ item }) => <CartLineItem line={item} onQuantity={onQuantity} onRemove={onRemove} quantity={pending[item.key] ?? item.quantity} />}
        testID="cart.list"
      />
    </Screen>
  );
}

function StoreHeader({ view, onOpen }: { view: CartView; onOpen: () => void }) {
  const eta = view.etaMin !== null && view.etaMax !== null ? etaLabel({ etaMinMinutes: view.etaMin, etaMaxMinutes: view.etaMax, eta: view.eta }) : null;
  return (
    <View style={styles.store} testID="cart.store">
      {view.logoUrls ? <RemoteImage alt={t('catalog.logoAlt', { name: view.storeName })} height={theme.size.controlSm} radius={14} urls={view.logoUrls} width={theme.size.controlSm} /> : null}
      <View style={styles.storeTexts}>
        <Text numberOfLines={1} variant="bodyStrong">
          {view.storeName}
        </Text>
        {eta ? (
          <Text color="secondary" variant="caption">
            {eta}
          </Text>
        ) : null}
      </View>
      <Pressable accessibilityLabel={`${t('cart.seeStore')}, ${view.storeName}`} accessibilityRole="link" hitSlop={theme.hitSlopFor(theme.size.iconSm)} onPress={onOpen} style={styles.seeStore} testID="cart.see-store">
        <Text color="link" variant="label">
          {t('cart.seeStore')}
        </Text>
      </Pressable>
    </View>
  );
}

/** Visitante: só o subtotal que ele viu; entrega e taxas são calculadas pelo servidor depois que entra. */
function VisitorSummary({ subtotalCents }: { subtotalCents: number }) {
  return (
    <View style={styles.visitor} testID="cart.visitor-summary">
      <View accessible accessibilityLabel={`${t('cart.subtotal')}, ${formatMoney(subtotalCents)}`} style={styles.footerTotal}>
        <Text>{t('cart.subtotal')}</Text>
        <Text>{formatMoney(subtotalCents)}</Text>
      </View>
      <Text color="secondary" variant="caption">
        {t('cart.visitorNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[4] },
  headerBlock: { gap: theme.space[3], paddingBottom: theme.space[2] },
  store: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], paddingVertical: theme.space[2] },
  storeTexts: { flex: 1 },
  seeStore: { minHeight: theme.size.touchMin, justifyContent: 'center' },
  addMore: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], minHeight: theme.size.touchMin },
  footer: { gap: theme.space[2] },
  footerTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[3] },
  visitor: { gap: theme.space[2], paddingVertical: theme.space[3] },
});
