import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../lib/useReducedMotion';
import { brandEase } from '../motion';
import { theme } from '../theme';

/** Barras do símbolo v4a: larguras 23:49:34 e recuos 24/0/18 (kit-marca-v3.md §1). */
const BARS = [
  { w: 20, x: 16, y: 0 },
  { w: 36, x: 0, y: 14 },
  { w: 26, x: 12, y: 28 },
] as const;

function Bar({ w, x, y, delay, color, run }: { w: number; x: number; y: number; delay: number; color: string; run: boolean }) {
  const p = useSharedValue(run ? 0.2 : 1);
  useEffect(() => {
    if (!run) {
      p.set(1);
      return;
    }
    p.set(withDelay(delay, withRepeat(withTiming(1, { duration: theme.motion.duration.loader / 2, easing: brandEase }), -1, true)));
  }, [run, delay, p]);
  // scaleX com origem à direita: desloca para compensar o centro do transform.
  const animated = useAnimatedStyle(() => ({ opacity: 0.3 + p.value * 0.7, transform: [{ translateX: (w * (1 - p.value)) / 2 }, { scaleX: p.value }] }));
  return <Animated.View style={[styles.bar, { left: x, top: y, width: w, backgroundColor: color }, animated]} />;
}

/** `kit/barras-carregando.svg`: substitui o spinner em botões e trechos curtos (skeleton continua para listas). Parado com "reduzir movimento". */
export function BarsLoader({ color = theme.color.brand[500], style, accessibilityLabel }: { color?: string; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const reduced = useReducedMotion();
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="progressbar" style={[styles.box, style]} accessible={Boolean(accessibilityLabel)}>
      {BARS.map((b, i) => (
        <Bar key={i} color={color} delay={i * 90} run={!reduced} w={b.w} x={b.x} y={b.y} />
      ))}
    </View>
  );
}

export interface BarsProgressProps {
  /** Etapa atual (1 a total). Feitas em marca, atual em acento, futuras em neutral.700 (sobre noite). */
  step: number;
  total?: number;
  /** Cor das etapas futuras (padrão: neutral.700, para fundo noite). */
  idle?: string;
}

/** `kit/barras-progresso.svg`: segmentos inclinados (-8 graus). Nunca é a única pista: sempre vem com "Etapa N de 5 · nome". */
export function BarsProgress({ step, total = 5, idle = theme.color.neutral[700] }: BarsProgressProps) {
  const reduced = useReducedMotion();
  const slide = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    slide.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false));
  }, [reduced, slide]);
  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value * 120 - 40 }] }));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.progress}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const current = n === step;
        const color = n < step ? theme.color.brand[500] : current ? theme.color.accent.base : idle;
        return (
          <View key={n} style={[styles.segment, { backgroundColor: color, transform: [{ skewX: `${theme.shape.lean}deg` }] }]}>
            {current && !reduced ? <Animated.View style={[styles.sheen, sheen]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 56, height: 36 },
  bar: { position: 'absolute', height: 8, borderRadius: 4 },
  progress: { flexDirection: 'row', gap: 7, height: 12 },
  segment: { flex: 1, height: 12, borderRadius: 4, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, bottom: 0, width: 14, backgroundColor: theme.color.surface.ink, opacity: 0.55 },
});
