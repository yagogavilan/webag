import { haptics as hapticTokens } from '@webag/tokens/native';
import * as Haptics from 'expo-haptics';

type HapticName = keyof typeof hapticTokens;

/** Nomes semânticos do design system (§0.5 da spec) -> expo-haptics. Nunca lança: haptic é conforto, não função. */
export async function haptic(name: HapticName): Promise<void> {
  try {
    switch (name) {
      case 'selection':
        await Haptics.selectionAsync();
        break;
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // aparelho sem motor de vibração ou desligado nas configurações
  }
}
