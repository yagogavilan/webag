import type { Banner } from '@webag/shared';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { RemoteImage } from '../../components/RemoteImage';
import { t } from '../../i18n';
import { theme } from '../../theme';

export interface BannerCarouselProps {
  banners: readonly Banner[];
  onOpen: (banner: Banner) => void;
}

const BANNER_MAX_HEIGHT = 280;

/**
 * Banners 2:1 do admin (DEC-024 a). Sem rotação automática (acessibilidade e dado móvel). Três pontos mostram qual banner está
 * em tela (U8.3: no lugar das setas "‹ 1 / 3 ›", que gastavam 54 px); quem não usa gesto navega pelas ações "Próximo banner" e
 * "Banner anterior" do leitor de tela. Altura máxima de 280 no tablet. Banner sem destino não é tocável.
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
    <View
      accessibilityActions={[
        { name: 'increment', label: t('home.bannerNext') },
        { name: 'decrement', label: t('home.bannerPrev') },
      ]}
      accessibilityLabel={t('home.banners')}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: t('home.bannerOf', { n: index + 1, total: banners.length }) }}
      onAccessibilityAction={(e) => go(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      style={styles.wrap}
      testID="home.banners"
    >
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
            <RemoteImage aspectRatio={2} priority="high" radius={theme.radius.xl} urls={item.image.urls} width={width} />
          </Pressable>
        )}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
      />
      {banners.length > 1 ? (
        // só indicador: o toque fica no próprio banner (≥ 44 pt) e a navegação sem gesto está nas ações do leitor de tela
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.dots} testID="home.banner-dots">
          {banners.map((b, i) => (
            <View key={b.id} style={[styles.dot, i === index && styles.dotOn]} testID={i === index ? 'home.banner-dot-active' : undefined} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const Gap = () => <View style={{ width: theme.space[2] }} />;

const styles = StyleSheet.create({
  wrap: { gap: theme.space[2] },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space[1], height: theme.space[2] },
  dot: { width: theme.space[2], height: theme.space[2], borderRadius: theme.radius.pill, backgroundColor: theme.color.border.default },
  dotOn: { width: theme.space[5], backgroundColor: theme.color.action.primary },
});
