import type { Banner } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { Palco } from '../../art/Palco';
import { ProductArt, objectFor } from '../../art/ProductArt';
import { Sticker } from '../../components/Sticker';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { coverColor } from './StoreRow';

/** Texto do botão por destino. Sem destino não há botão (o banner não é tocável). */
function ctaLabel(type: Banner['destination']['type']): string | null {
  switch (type) {
    case 'coupon':
      return t('home.bannerCtaCoupon');
    case 'category':
      return t('home.bannerCtaCategory');
    case 'store':
      return t('home.bannerCtaStore');
    case 'product':
      return t('home.bannerCtaProduct');
    default:
      return null;
  }
}

/**
 * Banner desenhado pelo app com o kit v3 (bloco de cor sólida, palco da sacola, objeto do produto, título e botão lima). Aparece
 * quando o banner do admin não tem arte ou ela não carregou: nunca uma caixa cinza vazia. A arte enviada pelo admin (2:1) tem
 * prioridade e já traz o próprio texto; este desenho só cobre a falta dela. Decorativo: o rótulo e o toque ficam no cartão.
 */
export function BannerArt({ banner, index, width }: { banner: Banner; index: number; width: number }) {
  const { type, id, code } = banner.destination;
  const dark = index % 2 === 1;
  const block = type === 'store' && id ? coverColor(id) : dark ? theme.color.surface.ink : theme.color.brand[500];
  const palco = block === theme.color.brand[500] ? theme.color.brand[700] : theme.color.brand[500];
  const cta = ctaLabel(type);
  const art = objectFor(banner.title);
  const height = width / 2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.block, { backgroundColor: block }]}
      testID="home.banner-art"
    >
      <View style={[styles.palco, { right: -width * 0.04, top: height * 0.1 }]}>
        <Palco color={palco} eyes={block} rotate={8} size={height * 0.95} />
      </View>
      <View style={[styles.art, { right: width * 0.02, bottom: height * 0.04 }]}>
        <ProductArt color="#F2EFE9" ground="rgba(0,0,0,0.35)" name={art} size={height * 0.78} />
      </View>
      {type === 'coupon' && code ? <Sticker label={code} rotate={6} style={[styles.code, { top: height * 0.1, right: width * 0.1 }]} /> : null}
      <View style={[styles.texts, { width: width * 0.56 }]}>
        <Text allowFontScaling={false} numberOfLines={3} style={styles.title} variant="title1">
          {banner.title}
        </Text>
        {cta ? (
          <View style={styles.cta}>
            <Text allowFontScaling={false} numberOfLines={1} style={styles.ctaText} variant="bodyStrong">
              {cta}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { overflow: 'hidden', borderRadius: theme.radius.xl },
  palco: { position: 'absolute' },
  art: { position: 'absolute' },
  code: { position: 'absolute' },
  texts: { flex: 1, justifyContent: 'space-between', alignItems: 'flex-start', padding: theme.space[4] },
  title: { color: theme.color.neutral[0] },
  cta: { minHeight: 36, justifyContent: 'center', backgroundColor: theme.color.accent.base, borderRadius: theme.radius.control, paddingHorizontal: theme.space[3] },
  ctaText: { color: theme.color.text.primary },
});
