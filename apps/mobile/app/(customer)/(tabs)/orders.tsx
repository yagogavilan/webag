import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import type { OrderSummary } from '@webag/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '../../../src/api/session';
import { Button } from '../../../src/components/Button';
import { Receipt } from '../../../src/components/icons';
import { Screen } from '../../../src/components/Screen';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { Skeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { EmailVerifyBanner } from '../../../src/features/auth/EmailVerifyBanner';
import { useCartParams } from '../../../src/features/cart/hooks';
import { useOrdersList } from '../../../src/features/orders/hooks';
import { OrderRow } from '../../../src/features/orders/OrderRow';
import { reorderItems } from '../../../src/features/orders/reorder';
import { fetchOrder } from '../../../src/api/orders-api';
import { useInvalidateOnEvent } from '../../../src/features/realtime/useRealtime';
import { t } from '../../../src/i18n';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

type Row = { kind: 'header'; key: string; title: string; testID: string } | { kind: 'order'; key: string; order: OrderSummary };

/** S8. Meus pedidos: "Em andamento" no topo e "Anteriores"; PIX pendente com "Pagar"; pedido entregue com "Pedir de novo". */
export default function OrdersScreen() {
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const session = useSession();
  const cartParams = useCartParams();
  const { connected } = useInvalidateOnEvent(undefined, session.status === 'authenticated');
  const active = useOrdersList('active', { connected });
  const past = useOrdersList('past');
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const a = active.data?.pages.flatMap((p) => p.data) ?? [];
    const p = past.data?.pages.flatMap((pg) => pg.data) ?? [];
    if (a.length > 0) out.push({ kind: 'header', key: 'h-active', title: t('orders.active'), testID: 'orders.section-active' }, ...a.map((order): Row => ({ kind: 'order', key: order.id, order })));
    if (p.length > 0) out.push({ kind: 'header', key: 'h-past', title: t('orders.past'), testID: 'orders.section-past' }, ...p.map((order): Row => ({ kind: 'order', key: order.id, order })));
    return out;
  }, [active.data, past.data]);

  const open = (id: string) => router.push({ pathname: '/order/[id]', params: { id } } as never);

  const onReorder = async (summary: OrderSummary) => {
    setBusy(summary.id);
    try {
      const full = await fetchOrder(summary.id);
      const result = await reorderItems(full, cartParams);
      void client.invalidateQueries({ queryKey: ['cart'] });
      if (result.added === 0) toast.show(t('order.reorderFailed'));
      else if (result.missing.length > 0) toast.show(t('order.reorderPartial', { names: result.missing.join(', ') }));
      else {
        toast.show(t('order.reorderDone'));
        router.push('/cart');
      }
    } catch {
      toast.show(t('order.reorderFailed'));
    } finally {
      setBusy(null);
    }
  };

  const title = (
    <Text accessibilityRole="header" style={styles.title} variant="title1">
      {t('orders.title')}
    </Text>
  );

  if (session.status !== 'authenticated') {
    return (
      <Screen bottomInset={false} header={title} scroll={false}>
        <EmptyState actionLabel={t('orders.visitorAction')} icon={Receipt} onAction={() => router.push('/login')} testID="orders.login" text={t('orders.visitorText')} title={t('orders.visitorTitle')} />
      </Screen>
    );
  }

  const loading = (active.isLoading || past.isLoading) && rows.length === 0;
  const failed = (active.isError || past.isError) && rows.length === 0;

  return (
    <Screen bottomInset={false} header={title} padded={false} scroll={false} testID="orders.screen">
      <EmailVerifyBanner />
      {loading ? (
        <View style={styles.pad} testID="orders.skeleton">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton height={72} key={i} radius={theme.radius.lg} />
          ))}
        </View>
      ) : failed ? (
        <ErrorState offline={!online} onRetry={() => void Promise.all([active.refetch(), past.refetch()])} retryLabel={t('common.tryAgain')} testID="orders.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      ) : rows.length === 0 ? (
        <EmptyState actionLabel={t('orders.emptyAction')} icon={Receipt} onAction={() => router.replace('/')} testID="orders.explore" text={t('orders.emptyText')} title={t('orders.emptyTitle')} />
      ) : (
        <FlashList
          contentContainerStyle={styles.list}
          data={rows}
          getItemType={(r) => r.kind}
          keyExtractor={(r) => r.key}
          ListFooterComponent={
            past.hasNextPage ? <Button label={t('orders.loadMore')} loading={past.isFetchingNextPage} onPress={() => void past.fetchNextPage()} variant="text" /> : null
          }
          onRefresh={() => void Promise.all([active.refetch(), past.refetch()])}
          refreshing={active.isRefetching || past.isRefetching}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View testID={item.testID}>
                <SectionHeader title={item.title} />
              </View>
            ) : (
              <OrderRow
                onPress={() => open(item.order.id)}
                {...(item.order.status === 'awaiting_payment' ? { onPay: () => router.push({ pathname: '/pay/[orderId]', params: { orderId: item.order.id } } as never) } : {})}
                {...(item.order.status === 'delivered' && busy !== item.order.id ? { onReorder: () => void onReorder(item.order) } : {})}
                order={item.order}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: theme.layout.screenPaddingX, paddingTop: theme.space[3], paddingBottom: theme.space[2] },
  pad: { padding: theme.layout.screenPaddingX, gap: theme.space[3] },
  list: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[6] },
});
