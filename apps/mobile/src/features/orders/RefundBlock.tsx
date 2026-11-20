import { StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { refundText, type Refund } from './refund';

/** "Estorno de R$ X" com status e prazo por meio (WB-259). Só aparece se a API mandou `refund`; nunca promete data. */
export function RefundBlock({ refund }: { refund: Refund | null }) {
  if (!refund) return null;
  const text = refundText(refund);
  return (
    <Card style={styles.card} testID="order.refund">
      <View accessible accessibilityLabel={text.a11y} style={styles.texts}>
        <View style={styles.head}>
          <Text style={styles.title} variant="title2">{text.title}</Text>
          <Badge label={text.status} testID="order.refund-status" tone={refund.status === 'completed' ? 'success' : 'info'} />
        </View>
        <Text color="secondary">{text.body}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.color.surface.sunken },
  texts: { gap: theme.space[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], flexWrap: 'wrap' },
  title: { flexShrink: 1 },
});
