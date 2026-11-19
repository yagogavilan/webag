import { useQueryClient } from '@tanstack/react-query';
import type { CreateReviewRequest } from '@webag/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ApiError } from '../../../src/api/problem';
import { sendReview } from '../../../src/api/exchanges-api';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { Header } from '../../../src/components/Header';
import { Star } from '../../../src/components/icons';
import { RadioListItem } from '../../../src/components/RadioListItem';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { orderKey, useOrder } from '../../../src/features/checkout/hooks';
import { t } from '../../../src/i18n';
import { haptic } from '../../../src/lib/haptics';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

type Fit = NonNullable<CreateReviewRequest['fit']>;
const FITS: readonly { value: Fit; label: 'review.fitSmall' | 'review.fitOk' | 'review.fitLarge' }[] = [
  { value: 'small', label: 'review.fitSmall' },
  { value: 'ok', label: 'review.fitOk' },
  { value: 'large', label: 'review.fitLarge' },
];

/** O item tem tamanho? Só então "como vestiu" aparece (peças de roupa e calçado; fit alimenta a ficha do produto). */
const hasSize = (attributes: Record<string, string>): boolean => Object.keys(attributes).some((k) => /tam|size|numer/i.test(k));

/** Avaliação do pedido (nota de 1 a 5, comentário e, para peças com tamanho, "como vestiu"). */
export default function ReviewScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = String(orderId ?? '');
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const order = useOrder(id, { poll: false });
  const [rating, setRating] = useState(0);
  const [fit, setFit] = useState<Fit | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const header = <Header title={t('review.title')} />;
  if (order.isLoading) {
    return (
      <Screen header={header} testID="review.skeleton">
        <Skeleton height={48} />
        <Skeleton height={120} />
      </Screen>
    );
  }
  if (order.isError || !order.data) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void order.refetch()} retryLabel={t('common.tryAgain')} testID="review.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  const first = order.data.items[0];
  const sized = order.data.items.length === 1 && first ? hasSize(first.attributes) : false;

  const submit = async () => {
    if (rating < 1) {
      void haptic('error');
      setError(t('review.errRating'));
      return;
    }
    if (!online) {
      setError(t('review.offline'));
      return;
    }
    setError(null);
    setSending(true);
    try {
      await sendReview(id, {
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(sized && fit ? { fit } : {}),
        ...(order.data?.items.length === 1 && first ? { productId: first.productId } : {}),
      });
      void haptic('success');
      void client.invalidateQueries({ queryKey: orderKey(id) });
      toast.show(t('review.thanks'));
      router.back();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t('review.already') : t('review.errSend'));
    } finally {
      setSending(false);
    }
  };

  const footer = (
    <View style={styles.footer}>
      {error ? <Banner text={error} tone="danger" /> : null}
      <Button label={sending ? t('review.submitting') : t('review.submit')} loading={sending} onPress={() => void submit()} size="lg" testID="review.submit" />
    </View>
  );

  return (
    <Screen footer={footer} header={header} testID="review.screen">
      <Text color="secondary">{order.data.store.name}</Text>
      <Text accessibilityRole="header" variant="title2">{t('review.rating')}</Text>
      <View accessibilityRole="radiogroup" style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            accessibilityLabel={t('review.star', { n })}
            accessibilityRole="radio"
            accessibilityState={{ checked: rating === n }}
            hitSlop={4}
            key={n}
            onPress={() => {
              setRating(n);
              setError(null);
              void haptic('selection');
            }}
            style={styles.star}
            testID={`review.star-${n}`}
          >
            <Star color={n <= rating ? theme.color.rating.star : theme.color.border.strong} size={36} weight={n <= rating ? 'fill' : 'regular'} />
          </Pressable>
        ))}
      </View>
      {sized ? (
        <View accessibilityRole="radiogroup" style={styles.group} testID="review.fit">
          <Text accessibilityRole="header" variant="title2">{t('review.fitTitle')}</Text>
          {FITS.map((f) => (
            <RadioListItem key={f.value} onPress={() => setFit(f.value)} selected={fit === f.value} testID={`review.fit-${f.value}`} title={t(f.label)} />
          ))}
        </View>
      ) : null}
      <Text color="secondary" variant="captionStrong">{t('review.comment')}</Text>
      <TextInput accessibilityLabel={t('review.comment')} maxLength={1000} multiline onChangeText={setComment} style={styles.input} testID="review.comment" value={comment} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: theme.space[1] },
  star: { width: theme.size.touchMin, height: theme.size.touchMin, alignItems: 'center', justifyContent: 'center' },
  group: { gap: theme.space[2] },
  input: { minHeight: 96, borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.default, borderRadius: theme.radius.control, padding: theme.space[3], textAlignVertical: 'top', color: theme.color.text.primary, backgroundColor: theme.color.surface.card, ...theme.text.body },
  footer: { gap: theme.space[2] },
});
