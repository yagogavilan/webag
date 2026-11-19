import { Image } from 'expo-image';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { pickImageUrl } from '../features/catalog/image';
import { theme } from '../theme';
import { Image as ImageIcon } from './icons';

export interface RemoteImageProps {
  /** `{ "<largura px>": "<url>" }` como vem da API. */
  urls: Record<string, string> | undefined;
  /** Largura em dp na tela: escolhe o arquivo certo (não baixa 1200 px para um logo de 56). */
  width: number;
  height?: number;
  aspectRatio?: number;
  /** Texto para o leitor de tela. Sem `alt` a imagem é decorativa e fica oculta. */
  alt?: string;
  radius?: number;
  priority?: 'low' | 'normal' | 'high';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Imagem da API com cache em disco e memória (expo-image), carregamento progressivo (fundo neutro + fade de 200 ms) e
 * tamanho adequado à tela. Falhou ou não existe: placeholder neutro, sem ícone quebrado (§5 do design system).
 */
export function RemoteImage({ urls, width, height, aspectRatio, alt, radius = theme.radius.lg, priority = 'normal', style, testID }: RemoteImageProps) {
  const uri = pickImageUrl(urls, width);
  const box: { width: DimensionValue; height?: number; aspectRatio?: number } = { width };
  if (height !== undefined) box.height = height;
  if (aspectRatio !== undefined) box.aspectRatio = aspectRatio;
  return (
    <View
      accessibilityElementsHidden={alt === undefined}
      importantForAccessibility={alt === undefined ? 'no-hide-descendants' : 'auto'}
      style={[styles.box, box, { borderRadius: radius }, style]}
      testID={testID}
    >
      {uri ? (
        <Image
          accessibilityLabel={alt}
          cachePolicy="memory-disk"
          contentFit="cover"
          priority={priority}
          recyclingKey={uri}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          transition={200}
        />
      ) : (
        <ImageIcon color={theme.color.neutral[400]} size={theme.size.iconMd} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: theme.color.surface.sunken, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
