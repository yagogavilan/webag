import { StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';

export interface PriceProps {
  cents: number;
  originalCents?: number | null;
  discountPercent?: number | null;
  /** "a partir de" antes de escolher a variação. */
  from?: boolean;
  size?: 'price' | 'display';
  muted?: boolean;
  testID?: string;
}

/** Preço (nunca trunca), preço antigo riscado e selo de desconto. A leitura diz os dois valores, não só "riscado". */
export function Price({ cents, originalCents, discountPercent, from, size = 'price', muted, testID }: PriceProps) {
  const hasPromo = originalCents != null && originalCents > cents;
  const value = formatMoney(cents);
  const label = hasPromo
    ? `${from ? 'a partir de ' : ''}${value}, de ${formatMoney(originalCents)}${discountPercent ? `, ${discountPercent}% de desconto` : ''}`
    : `${from ? 'a partir de ' : ''}${value}`;
  return (
    <View accessible accessibilityLabel={label} style={styles.wrap} testID={testID}>
      {from ? (
        <Text color="secondary" variant="caption">
          {t('catalog.from')}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Text color={muted ? 'secondary' : 'primary'} variant={size}>
          {value}
        </Text>
        {hasPromo ? (
          <Text color="secondary" style={styles.struck} variant="caption">
            {formatMoney(originalCents)}
          </Text>
        ) : null}
        {hasPromo && discountPercent ? <Badge label={t('catalog.off', { pct: discountPercent })} tone="brand" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: theme.space[2], rowGap: theme.space[1] },
  struck: { textDecorationLine: 'line-through' },
});
