import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** "Remover animações" do sistema: shimmer vira estático, sem deslocamento (design-system.md §7). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
