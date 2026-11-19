import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Check } from '../../components/icons';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { theme } from '../../theme';

/**
 * Selo de celebração: o círculo branco entra com mola curta e o check "aparece" (opacidade). Só `transform` e `opacity`, no driver
 * nativo (60 fps em Android de entrada). Com "reduzir movimento" já nasce no estado final. Usado só DEPOIS da confirmação do
 * servidor (zona Dinheiro: nada de confete antes).
 */
export function Celebration({ size = 96 }: { size?: number }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(0.6)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      scale.setValue(1);
      checkOpacity.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [reduced, scale, checkOpacity]);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="celebration">
      <Animated.View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, transform: [{ scale }] }]}>
        <Animated.View style={{ opacity: checkOpacity }}>
          <Check color={theme.color.action.primary} size={size * 0.5} weight="bold" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ disc: { backgroundColor: theme.color.neutral[0], alignItems: 'center', justifyContent: 'center' } });
