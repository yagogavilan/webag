import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { Palco } from '../../art/Palco';
import { Check } from '../../components/icons';
import { haptic } from '../../lib/haptics';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { theme } from '../../theme';

const COLORS = [theme.color.accent.base, theme.color.neutral[0], theme.color.brand[300], theme.color.surface.ink] as const;
const SHAPES = ['pill', 'dot', 'square', 'trap'] as const;
const COUNT = 30;

/** Pseudoaleatório estável por índice (sem Math.random no render: a mesma celebração em todo aparelho e teste). */
const seeded = (i: number, salt: number): number => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Piece({ i, run }: { i: number; run: boolean }) {
  const p = useSharedValue(run ? 0 : 1);
  const spec = useMemo(
    () => ({ dx: (seeded(i, 1) - 0.5) * 300, up: 120 + seeded(i, 2) * 140, fall: 60 + seeded(i, 3) * 160, rot: (seeded(i, 4) - 0.5) * 360, color: COLORS[i % COLORS.length] as string, shape: SHAPES[i % SHAPES.length] as (typeof SHAPES)[number], delay: seeded(i, 5) * 140 }),
    [i],
  );
  useEffect(() => {
    if (!run) return;
    p.set(withDelay(900 + spec.delay, withTiming(1, { duration: theme.motion.duration.confetti, easing: Easing.out(Easing.quad) })));
  }, [run, p, spec.delay]);
  const style = useAnimatedStyle(() => {
    const k = p.value;
    // sobe nos primeiros 40% e cai depois
    const y = k < 0.4 ? -spec.up * (k / 0.4) : -spec.up + (spec.up + spec.fall) * ((k - 0.4) / 0.6);
    return { opacity: run ? (k === 0 ? 0 : k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1) : 0, transform: [{ translateX: spec.dx * k }, { translateY: y }, { rotate: `${spec.rot * k}deg` }] };
  });
  const base = spec.shape === 'pill' ? styles.pill : spec.shape === 'dot' ? styles.dot : spec.shape === 'square' ? styles.square : styles.trap;
  return <Animated.View style={[styles.piece, base, { backgroundColor: spec.color }, style]} />;
}

/**
 * Celebração do pedido confirmado (direcao-v3.md §5): a sacola cai com mola, o selo de check salta e 30 formas da marca saem dele
 * (1 vez, 1.500 ms, só transform e opacity). Háptico de sucesso ao abrir. Com "reduzir movimento" nasce no estado final e sem
 * confete. Usada só DEPOIS da confirmação do servidor (zona Dinheiro: nada de confete antes).
 */
export function Celebration({ size = 120 }: { size?: number }) {
  const reduced = useReducedMotion();
  const drop = useSharedValue(reduced ? 1 : 0);
  const seal = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    void haptic('success');
    if (reduced) return;
    drop.set(withSpring(1, { damping: 11, stiffness: 140 }));
    seal.set(withDelay(500, withSpring(1, theme.springs.pop)));
  }, [reduced, drop, seal]);
  const bagStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, drop.value * 2), transform: [{ translateY: (1 - drop.value) * -90 }] }));
  const sealStyle = useAnimatedStyle(() => ({ transform: [{ scale: seal.value }] }));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, { width: size * 1.6, height: size * 1.3 }]} testID="celebration">
      <Animated.View style={bagStyle}>
        <Palco color={theme.color.brand[700]} eyes={theme.color.brand[500]} rotate={-6} size={size} />
      </Animated.View>
      <Animated.View style={[styles.seal, sealStyle]}>
        <Check color={theme.color.surface.ink} size={34} weight="bold" />
      </Animated.View>
      {!reduced && Array.from({ length: COUNT }, (_, i) => <Piece i={i} key={i} run />)}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
  seal: { position: 'absolute', right: 8, bottom: 14, width: 64, height: 64, borderRadius: 20, backgroundColor: theme.color.accent.base, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: theme.color.brand[500] },
  piece: { position: 'absolute', right: 40, bottom: 44 },
  pill: { width: 14, height: 6, borderRadius: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  square: { width: 8, height: 8, borderRadius: 2 },
  trap: { width: 10, height: 7, borderRadius: 2, transform: [{ skewX: '-8deg' }] },
});
