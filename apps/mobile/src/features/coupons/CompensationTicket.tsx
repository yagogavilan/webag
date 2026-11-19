import type { Order } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Ticket } from '../../components/icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { compensationNote } from './model';

/**
 * Bilhete da compensação por atraso na tela do pedido (onda-7-eta-atraso.md §3.7, WB-254): só aparece se o servidor mandou
 * `Order.compensation` (pedido entregue com atraso, com compensação). Tipo, valor e prazo são do servidor; o app não decide se há direito.
 */
export function CompensationTicket({ compensation, onOpen }: { compensation: Order['compensation']; onOpen: () => void }) {
  if (!compensation) return null;
  const note = compensationNote(compensation);
  return (
    <Card style={styles.card} testID="tracking.compensation">
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ticket color={theme.color.neutral[0]} size={theme.size.iconMd} />
        </View>
        <View accessible accessibilityLabel={`${note.title}. ${note.body}`} style={styles.texts}>
          <Text variant="title2">{note.title}</Text>
          <Text color="secondary">{note.body}</Text>
        </View>
      </View>
      <Button label={t('comp.open')} onPress={onOpen} testID="tracking.compensation-open" variant="text" />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.color.surface.sunken, gap: theme.space[2] },
  row: { flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' },
  icon: { width: 48, height: 48, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface.ink, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: theme.space[1] },
});
