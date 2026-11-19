import { easing, springs } from '@webag/tokens/native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../lib/haptics';
import { useReducedMotion } from '../lib/useReducedMotion';
import { theme } from '../theme';

/** Curva da marca (bezier .2,.8,.2,1) para withTiming. */
export const brandEase = Easing.bezier(easing.brand[0] as number, easing.brand[1] as number, easing.brand[2] as number, easing.brand[3] as number);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressyProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Háptico do toque (chip, aba, tamanho: 'selection'). */
  feedback?: 'selection' | 'light';
  /** Escala ao tocar (motion.press: 0,95). */
  pressedScale?: number;
}

/** Pressable com `motion.press`: escala 0,95 no toque e volta com mola; sem animação com "reduzir movimento". */
export function Pressy({ style, feedback, pressedScale = 0.95, onPressIn, onPressOut, onPress, children, ...rest }: PressyProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPress={(e) => {
        if (feedback) void haptic(feedback);
        onPress?.(e);
      }}
      onPressIn={(e) => {
        if (!reduced) scale.set(withSpring(pressedScale, springs.press));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) scale.set(withSpring(1, springs.press));
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** `motion.cascade`: o bloco entra de baixo (translateY 18 para 0 e opacidade), 55 ms de atraso por posição, máx. 8 blocos, 1 vez por tela. */
export function Rise({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const step = Math.min(index, theme.motion.cascadeMax - 1);
    p.set(withDelay(step * theme.motion.duration.cascadeStep + 60, withTiming(1, { duration: theme.motion.duration.cascade, easing: brandEase })));
  }, [index, p, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 18 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** `motion.pop`: entra com sobressalto (scale 0 para 1 com mola). Háptico leve opcional. */
export function Pop({ children, style, trigger = true, haptics = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; trigger?: boolean; haptics?: boolean }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(reduced || !trigger ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      s.set(1);
      return;
    }
    if (trigger) {
      s.set(0);
      s.set(withSpring(1, springs.pop));
      if (haptics) void haptic('light');
    }
  }, [trigger, reduced, haptics, s]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * `motion.count`: número que rola do valor antigo ao novo (450 ms, easeOutCubic). Só rola em mudança causada pelo usuário:
 * o primeiro valor aparece direto, sem rolar ao abrir a tela (zona de dinheiro). Com "reduzir movimento" troca direto.
 */
export function useCountTo(target: number): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const [prev, setPrev] = useState(target);
  if (prev !== target && reduced) {
    setPrev(target);
    setShown(target);
  }
  useEffect(() => {
    if (reduced || prev === target) return;
    const from = shown;
    const start = Date.now();
    const total = theme.motion.duration.count;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - start) / total);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setPrev(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);
  return reduced ? target : shown;
}
