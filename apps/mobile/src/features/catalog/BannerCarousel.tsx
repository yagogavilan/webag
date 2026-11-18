import type { Banner } from '@webag/shared';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CaretLeft, CaretRight } from '../../components/icons';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';

export interface BannerCarouselProps {
  banners: readonly Banner[];
  onOpen: (banner: Banner) => void;
}

const BANNER_MAX_HEIGHT = 280;

/**
 * Banners 2:1 do admin (DEC-024 a). Sem rotação automática (acessibilidade e dado móvel); pontos "Banner 2 de 4" e botões
 * Anterior e Próximo para quem não usa gesto. Altura máxima de 280 no tablet. Banner sem destino não é tocável.
 */
export function BannerCarousel({ banners, onOpen }: BannerCarouselProps) {
  const { width: screen } = useWindowDimensions();
  const list = useRef<FlatList<Banner>>(null);
  const [index, setIndex] = useState(0);
  const available = Math.min(screen, 720) - theme.layout.screenPaddingX * 2;
  const width = Math.min(available, BANNER_MAX_HEIGHT * 2);
  const step = width + theme.space[2];

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(banners.length - 1, next));
    list.current?.scrollToOffset({ offset: clamped * step, animated: true });
    setIndex(clamped);
  };

  return (
    <View accessibilityLabel={t('home.banners')} accessibilityRole="adjustable" style={styles.wrap}>
      <FlatList
        data={banners}
        decelerationRate="fast"
        horizontal
        ItemSeparatorComponent={Gap}
        keyExtractor={(b) => b.id}
        onMomentumScrollEnd={(e) => setIndex(Math.max(0, Math.min(banners.length - 1, Math.round(e.nativeEvent.contentOffset.x / step))))}
        ref={list}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={item.title}
            accessibilityRole={item.destination.type === 'none' ? 'image' : 'button'}
            disabled={item.destination.type === 'none'}
            onPress={() => onOpen(item)}
            style={{ width }}
            testID={`home.banner-${item.id}`}
          >
            <RemoteImage aspectRatio={2} priority="high" radius={theme.radius.md} urls={item.image.urls} width={width} />
          </Pressable>
        )}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
      />
      {banners.length > 1 ? (
        <View style={styles.controls}>
          <Pressable accessibilityLabel={t('home.bannerPrev')} accessibilityRole="button" disabled={index === 0} hitSlop={theme.hitSlopFor(theme.size.iconMd)} onPress={() => go(index - 1)} style={styles.arrow} testID="home.banner-prev">
            <CaretLeft color={index === 0 ? theme.color.text.disabled : theme.color.text.primary} size={theme.size.iconSm} />
          </Pressable>
          <Text accessibilityLabel={t('home.bannerOf', { n: index + 1, total: banners.length })} color="secondary" variant="caption">
            {index + 1} / {banners.length}
          </Text>
          <Pressable accessibilityLabel={t('home.bannerNext')} accessibilityRole="button" disabled={index === banners.length - 1} hitSlop={theme.hitSlopFor(theme.size.iconMd)} onPress={() => go(index + 1)} style={styles.arrow} testID="home.banner-next">
            <CaretRight color={index === banners.length - 1 ? theme.color.text.disabled : theme.color.text.primary} size={theme.size.iconSm} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const Gap = () => <View style={{ width: theme.space[2] }} />;

const styles = StyleSheet.create({
  wrap: { gap: theme.space[2] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space[2] },
  arrow: { width: theme.size.touchMin, height: theme.size.touchMin, alignItems: 'center', justifyContent: 'center' },
});
