import { FlashList } from '@shopify/flash-list';
import type { ListMyCouponsStatus, MyCoupon } from '@webag/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError } from '../../src/api/problem';
import { useSession } from '../../src/api/session';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Tag } from '../../src/components/icons';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { useCartActions } from '../../src/features/cart/hooks';
import { couponErrorMessage } from '../../src/features/cart/state';
import { benefitLabel, couponA11y, isExpiringSoon, minOrderLabel, validityLabel } from '../../src/features/coupons/model';
import { useMyCoupons } from '../../src/features/coupons/hooks';
import { t } from '../../src/i18n';
import { haptic } from '../../src/lib/haptics';
import { useNow } from '../../src/lib/useNow';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/**
 * Meus cupons (WB-033, X5; GET /v1/me/coupons, WB-254). Só cupons PESSOAIS da conta (hoje, a compensação por atraso). O app mostra o que
 * o servidor manda e deixa a sacola validar o uso (PUT /v1/cart/coupon). Campo "Tem um código?" fica fora: o contrato não tem como
 * adicionar cupom à conta, só aplicar na sacola (lá, na seção de cupom).
 */
export default function CouponsScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const session = useSession();
  const now = useNow(60_000);
  const queryClient = useQueryClient();
  const actions = useCartActions();
  const [filter, setFilter] = useState<ListMyCouponsStatus>('available');
  const [using, setUsing] = useState<string | null>(null);
  const query = useMyCoupons(filter);
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const header = <Header title={t('coupons.title')} />;

  const use = async (coupon: MyCoupon) => {
    if (using) return;
    setUsing(coupon.id);
    try {
      await actions.applyCoupon(coupon.code);
      void haptic('success');
      toast.show(t('coupons.applied'));
      router.push('/cart');
    } catch (error) {
      void haptic('error');
      // sacola vazia: o servidor recusa o cupom; a tela leva às lojas em vez de só dizer "não deu"
      toast.show(error instanceof ApiError && (error.code === 'CART_EMPTY' || error.status === 404) ? t('coupons.needBag') : error instanceof ApiError && error.code === 'EMAIL_VERIFICATION_REQUIRED' ? t('coupons.needEmail') : couponErrorMessage(error));
    } finally {
      setUsing(null);
      void queryClient.invalidateQueries({ queryKey: ['me', 'coupons'] });
    }
  };

  if (session.status !== 'authenticated') {
    return (
      <Screen header={header} testID="coupons.screen">
        <EmptyState actionLabel={t('login.submit')} icon={Tag} onAction={() => router.push({ pathname: '/login', params: { returnTo: '/coupons' } })} testID="coupons.guest" text={t('coupons.guestText')} title={t('coupons.guestTitle')} />
      </Screen>
    );
  }

  return (
    <Screen header={header} padded={false} scroll={false} testID="coupons.screen">
      <View style={styles.filter}>
        <Segmented
          label={t('coupons.filterLabel')}
          onChange={setFilter}
          options={[
            { value: 'available', label: t('coupons.filterAvailable'), testID: 'coupons.filter-available' },
            { value: 'all', label: t('coupons.filterAll'), testID: 'coupons.filter-all' },
          ]}
          value={filter}
        />
      </View>
      {query.isLoading ? (
        <View style={styles.pad} testID="coupons.skeleton">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton height={96} key={i} radius={theme.radius.lg} />
          ))}
        </View>
      ) : query.isError && rows.length === 0 ? (
        <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="coupons.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      ) : rows.length === 0 ? (
        <EmptyState actionLabel={t('coupons.emptyAction')} icon={Tag} onAction={() => router.replace('/')} testID="coupons.empty" text={t('coupons.emptyText')} title={t('coupons.emptyTitle')} />
      ) : (
        <FlashList
          contentContainerStyle={styles.pad}
          data={rows}
          keyExtractor={(c) => c.id}
          ListFooterComponent={query.hasNextPage ? <Button label={t('coupons.loadMore')} loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} variant="text" /> : null}
          renderItem={({ item: c }) => (
            <View accessibilityLabel={couponA11y(c, now)} accessible={false} style={styles.row} testID={`coupons.item-${c.id}`}>
              <View accessible accessibilityLabel={couponA11y(c, now)} style={styles.texts}>
                <Text color="secondary" variant="caption">{c.code}</Text>
                <Text variant="title2">{benefitLabel(c)}</Text>
                {minOrderLabel(c) ? <Text color="secondary" variant="caption">{minOrderLabel(c)}</Text> : null}
                <Text color="secondary" variant="caption">{validityLabel(c)}</Text>
                {c.origin === 'late_delivery' ? <Text color="secondary" variant="caption">{t('coupons.originLate')}</Text> : null}
                {isExpiringSoon(c, now) ? <Badge label={t('coupons.expiringSoon')} testID={`coupons.item-${c.id}-expiring`} tone="warning" /> : null}
              </View>
              {c.status === 'available' ? (
                <View style={styles.actions}>
                  <Button disabled={using !== null} label={using === c.id ? t('coupons.using') : t('coupons.use')} loading={using === c.id} onPress={() => void use(c)} testID={`coupons.item-${c.id}-use`} />
                  <Button
                    label={t('coupons.copy')}
                    onPress={() => void Clipboard.setStringAsync(c.code).then(() => toast.show(t('coupons.copied')))}
                    testID={`coupons.item-${c.id}-copy`}
                    variant="text"
                  />
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filter: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[2] },
  pad: { padding: theme.layout.screenPaddingX, gap: theme.space[3] },
  row: { gap: theme.space[3], backgroundColor: theme.color.surface.card, borderRadius: theme.radius.lg, padding: theme.space[4], marginBottom: theme.space[2] },
  texts: { gap: theme.space[1], alignItems: 'flex-start' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2] },
});
