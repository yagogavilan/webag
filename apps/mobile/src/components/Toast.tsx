import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../lib/useReducedMotion';
import { theme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastApi {
  show: (message: string, action?: { label: string; onPress: () => void }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });
export const useToast = (): ToastApi => useContext(ToastContext);

const DURATION = 4_000;
const DURATION_WITH_ACTION = 8_000;

/** Um toast por vez, em fila; 4 s (8 s com ação); anunciado ao leitor de tela (§3.1). Erro que exige decisão não é toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const current = queue[0];

  const show = useCallback<ToastApi['show']>((message, action) => {
    const item: ToastItem = { id: nextId.current++, message };
    if (action) {
      item.actionLabel = action.label;
      item.onAction = action.onPress;
    }
    setQueue((q) => [...q, item]);
  }, []);

  useEffect(() => {
    if (!current) return;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(current.message);
    const timer = setTimeout(
      () => setQueue((q) => q.slice(1)),
      current.actionLabel ? DURATION_WITH_ACTION : DURATION,
    );
    return () => clearTimeout(timer);
  }, [current]);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? <ToastView item={current} onDone={() => setQueue((q) => q.slice(1))} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: theme.motion.duration.fast, useNativeDriver: true }).start();
  }, [opacity, reduced, item.id]);

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + theme.space[4] }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, { opacity }]}
        testID="toast"
      >
        <Text color="inverse" numberOfLines={2} style={styles.message}>
          {item.message}
        </Text>
        {item.actionLabel ? (
          <Button
            label={item.actionLabel}
            onPress={() => {
              item.onAction?.();
              onDone();
            }}
            style={styles.action}
            onInverse
            variant="text"
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, paddingHorizontal: theme.layout.screenPaddingX, zIndex: theme.zIndex.toast },
  toast: {
    backgroundColor: theme.color.surface.inverse,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    ...theme.shadows.md,
  },
  message: { flex: 1 },
  action: { minWidth: theme.size.touchMin },
});
