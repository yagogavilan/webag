import { tokens } from '@webag/tokens';
import { maxFontSizeMultiplier, textStyles } from '@webag/tokens/native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Início do cliente (esqueleto). A tela real segue a spec do product-designer. */
export default function CustomerHome() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={maxFontSizeMultiplier.heading}
          style={styles.brand}
        >
          webag
        </Text>
        <Text maxFontSizeMultiplier={maxFontSizeMultiplier.default} style={styles.subtitle}>
          Lojas da sua região
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.color.surface.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.layout.screenPaddingX,
  },
  brand: {
    ...textStyles.display,
    color: tokens.color.text.brand,
  },
  subtitle: {
    ...textStyles.body,
    color: tokens.color.text.secondary,
  },
});
