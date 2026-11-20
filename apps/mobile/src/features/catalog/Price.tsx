import { StyleSheet, View } from 'react-native';
import { Money, type MoneySize } from '../../components/Money';
import { OfferSeal } from '../../components/Sticker';
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
  size?: 'price' | 'display' | 'hero';
  muted?: boolean;
  /** Mostra o selo lima ao lado (em cartões de produto o selo fica sobre a foto). */
  seal?: boolean;
  /** Sobre fundo noite. */
  onInk?: boolean;
  testID?: string;
}

const MONEY: Record<NonNullable<PriceProps['size']>, MoneySize> = { price: 'sm', display: 'md', hero: 'xl' };

/** Preço v3 ("R$" pequeno, centavos elevados), preço antigo riscado e selo de desconto. A leitura diz os dois valores, não só "riscado". */
export function Price({ cents, originalCents, discountPercent, from, size = 'price', muted, seal = false, onInk, testID }: PriceProps) {
  const hasPromo = originalCents != null && originalCents > cents;
  const value = formatMoney(cents);
  const label = hasPromo
    ? `${from ? 'a partir de ' : ''}${value}, de ${formatMoney(originalCents)}${discountPercent ? `, ${discountPercent}% de desconto` : ''}`
    : `${from ? 'a partir de ' : ''}${value}`;
  const color = onInk ? theme.color.neutral[0] : muted ? theme.color.text.secondary : theme.color.text.primary;
  return (
    <View accessible accessibilityLabel={label} style={styles.wrap} testID={testID}>
      {from ? (
        <Text color={onInk ? 'inverse' : 'secondary'} variant="caption">
          {t('catalog.from')}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Money color={color} cents={cents} size={MONEY[size]} />
        {hasPromo ? (
          <Text color={onInk ? 'inverse' : 'secondary'} style={styles.struck} variant="caption">
            {formatMoney(originalCents)}
          </Text>
        ) : null}
        {seal && hasPromo && discountPercent ? <OfferSeal label={t('catalog.off', { pct: discountPercent })} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: theme.space[2], rowGap: theme.space[1] },
  struck: { textDecorationLine: 'line-through' },
});
