import type { Review } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { SealCheck, Star } from '../../components/icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { ReportButton } from '../report/ReportSheet';
import { theme } from '../../theme';

const monthShort = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "12 nov" */
export function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${monthShort[d.getMonth()] ?? ''}`;
}

/** Uma avaliação (D10): nome abreviado, estrelas + nota em número, data, comentário, "Compra verificada" e resposta da loja. */
export function ReviewItem({ review }: { review: Review }) {
  return (
    <View style={styles.item}>
      <View
        accessible
        accessibilityLabel={[
          `${review.reviewer}, ${t('reviews.stars', { n: review.rating })}`,
          formatReviewDate(review.createdAt),
          review.comment,
          review.verifiedPurchase ? t('reviews.verified') : null,
          review.storeReply ? `${t('reviews.storeReply')}: ${review.storeReply}` : null,
        ]
          .filter(Boolean)
          .join('. ')}
        style={styles.body}
        testID={`reviews.item-${review.id}`}
      >
        <View style={styles.head}>
          <Text variant="bodyStrong">{review.reviewer}</Text>
          <Text color="secondary" variant="caption">
            {formatReviewDate(review.createdAt)}
          </Text>
        </View>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star color={theme.color.rating.star} key={n} size={16} weight={n <= review.rating ? 'fill' : 'regular'} />
          ))}
          <Text variant="caption">{review.rating}</Text>
        </View>
        {review.comment ? <Text>{review.comment}</Text> : null}
        {review.fit ? (
          <Text color="secondary" variant="caption">
            {`${t('review.fitTitle')} ${review.fit === 'small' ? t('review.fitSmall') : review.fit === 'large' ? t('review.fitLarge') : t('review.fitOk')}`}
          </Text>
        ) : null}
        {review.verifiedPurchase ? (
          <View style={styles.verified}>
            <SealCheck color={theme.color.feedback.success.base} size={16} weight="fill" />
            <Text color="success" variant="micro">
              {t('reviews.verified')}
            </Text>
          </View>
        ) : null}
        {review.storeReply ? (
          <View style={styles.reply} testID={`reviews.store-reply-${review.id}`}>
            <Text variant="captionStrong">{t('reviews.storeReply')}</Text>
            <Text color="secondary">{review.storeReply}</Text>
          </View>
        ) : null}
      </View>
      <ReportButton label={t('report.open')} subject={t('report.titleReview')} target="review" targetId={review.id} testID={`report.open-${review.id}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.space[1] },
  item: { gap: theme.space[1], paddingVertical: theme.space[3], borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.subtle },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] },
  reply: { marginLeft: theme.space[4], paddingLeft: theme.space[3], borderLeftWidth: theme.borderWidth.strong, borderLeftColor: theme.color.border.default, gap: 2 },
});
