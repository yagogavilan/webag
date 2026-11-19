import { Pressable, StyleSheet, View } from 'react-native';
import { Palco } from '../../art/Palco';
import { ProductArt } from '../../art/ProductArt';
import { CaretDown, MagnifyingGlass, MapPin } from '../../components/icons';
import { DiagonalBlock } from '../../components/DiagonalBlock';
import { Logo } from '../../components/Logo';
import { Highlight } from '../../components/Sticker';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { Pop, Pressy, Rise } from '../../motion';
import { theme } from '../../theme';
import { CartButton } from '../cart/CartButton';

export interface HomeHeroProps {
  topInset: number;
  addressLabel: string | null;
  modeLabel: string;
  onAddress: () => void;
  onSearch: () => void;
}

const HEIGHT = 398;
const BLOCK = 368;
/** Com endereço já escolhido (U8.3): logo, endereço e carrinho na mesma linha, sem arte nem cartaz, para a 1ª loja aparecer na 1ª tela. O título segue como cabeçalho para o leitor de tela. */
const HEIGHT_COMPACT = 134;
const BLOCK_COMPACT = 104;

/**
 * Cabeçalho do Início (direção v3): bloco roxo com corte diagonal, endereço em pílula noite (texto pequeno nunca sobre o roxo,
 * que reprova AA), título de cartaz com a palavra-chave marcada em lima, tênis sobre o palco da sacola e busca noite atravessando o corte.
 */
export function HomeHero({ topInset, addressLabel, modeLabel, onAddress, onSearch }: HomeHeroProps) {
  const compact = Boolean(addressLabel);
  const address = addressLabel ? (
    <Pressable
      accessibilityHint={t('home.pickAddress')}
      accessibilityLabel={`${modeLabel} ${addressLabel}`}
      accessibilityRole="button"
      onPress={onAddress}
      style={[styles.address, compact && styles.addressCompact]}
      testID="home.address"
    >
      <MapPin color={theme.color.accent.base} size={20} weight="duotone" />
      <Text numberOfLines={1} style={styles.addressText} variant="bodyStrong">
        {addressLabel}
      </Text>
      <CaretDown color={theme.color.neutral[0]} size={16} />
    </Pressable>
  ) : null;
  return (
    <View style={{ height: (compact ? HEIGHT_COMPACT : HEIGHT) + topInset }} testID="home.hero">
      <DiagonalBlock color={theme.color.brand[500]} height={(compact ? BLOCK_COMPACT : BLOCK) + topInset} style={StyleSheet.absoluteFill} />
      {compact ? null : (
        <View pointerEvents="none" style={[styles.art, { top: topInset }]}>
          <Pop style={styles.palco} trigger>
            <Palco color={theme.color.brand[700]} eyes={theme.color.brand[500]} rotate={6} size={140} />
          </Pop>
          <View style={styles.shoe}>
            <ProductArt color="#F4F2EE" ground="rgba(28,23,33,0.3)" name="sneaker" size={192} />
          </View>
        </View>
      )}
      <View style={[styles.content, { paddingTop: topInset + theme.space[2] }]}>
        <View style={[styles.top, compact && styles.topCompact]}>
          <Logo height={28} tone="onBrand" />
          {compact ? address : null}
          <CartButton onBrand />
        </View>
        {compact ? null : address}
        {compact ? (
          <View accessible accessibilityLabel={t('home.heroTitle')} accessibilityRole="header" style={styles.srOnly} testID="home.greeting" />
        ) : (
        <Rise index={1}>
          <View accessible accessibilityLabel={t('home.heroTitle')} accessibilityRole="header" style={styles.title} testID="home.greeting">
            <Text importantForAccessibility="no" style={styles.titleLine} variant="poster">
              {t('home.heroA')}
            </Text>
            <View style={styles.titleRow}>
              <Text importantForAccessibility="no" style={styles.titleLine} variant="poster">
                {t('home.heroB')}{' '}
              </Text>
              <Highlight>{t('home.heroWord')}</Highlight>
            </View>
            <Text importantForAccessibility="no" style={styles.titleLine} variant="poster">
              {t('home.heroC')}
            </Text>
          </View>
        </Rise>
        )}
      </View>
      <Pressy accessibilityLabel={t('home.searchPlaceholder')} accessibilityRole="search" onPress={onSearch} style={styles.search} testID="home.search-bar">
        <MagnifyingGlass color={theme.color.accent.base} duo={theme.color.accent.base} size={24} weight="duotone" />
        <Text style={styles.searchText} variant="body">
          {t('home.searchPlaceholder')}
        </Text>
      </Pressy>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { position: 'absolute', left: 0, right: 0, height: 360 },
  palco: { position: 'absolute', right: 10, top: 118 },
  shoe: { position: 'absolute', right: -8, top: 150, transform: [{ rotate: '-8deg' }] },
  content: { paddingHorizontal: theme.layout.screenPaddingX, gap: theme.space[3] },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  topCompact: { gap: theme.space[2] },
  addressCompact: { flex: 1, alignSelf: 'auto', maxWidth: undefined },
  address: { alignSelf: 'flex-start', maxWidth: '78%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.color.surface.ink, borderRadius: theme.radius.control, paddingHorizontal: 12 },
  addressText: { color: theme.color.text.onInk, flexShrink: 1 },
  title: { maxWidth: 236 },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  titleLine: { color: theme.color.neutral[0] },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  search: { position: 'absolute', left: 20, right: 20, bottom: 0, minHeight: 60, borderRadius: 18, backgroundColor: theme.color.surface.ink, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  searchText: { color: theme.color.text.onInkMuted },
});
