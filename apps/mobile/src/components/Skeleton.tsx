import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../lib/useReducedMotion';
import { theme } from '../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Bloco de carregamento com a forma do conteúdo. Brilho de 1200 ms; estático com "remover animações". Nunca spinner de tela cheia. */
export function Skeleton({ width = '100%', height = theme.space[4], radius = theme.radius.md, style }: SkeletonProps) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) {
      opacity.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: theme.motion.duration.shimmer / 2, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: theme.motion.duration.shimmer / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.color.skeleton.base, overflow: 'hidden' }, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.skeleton.highlight, opacity }]} />
    </View>
  );
}
