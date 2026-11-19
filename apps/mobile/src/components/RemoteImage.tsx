import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { ProductArt, artColorFor } from '../art/ProductArt';
import type { ObjectName } from '../art/objects-data';
import { pickImageUrl } from '../features/catalog/image';
import { theme } from '../theme';
import { Image as ImageIcon } from './icons';
import { Text } from './Text';

/**
 * O que aparece quando não há foto (ou ela não carregou): produto, loja e categoria nunca viram "quadrado cinza com glifo".
 * `art`: peça do kit v3 (kit-marca-v3.md §7) escolhida pela categoria ou nome. `initials`: logo de loja sem foto (kit §4).
 */
export type ImageFallback =
  | { art: ObjectName; seed?: string; color?: string; ground?: string; background?: string }
  | { initials: string; color: string; background?: string }
  | { node: ReactNode };

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
  /** Sem `fallback`, o placeholder neutro com o ícone de imagem (só para o que não é produto nem loja). */
  fallback?: ImageFallback;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Imagem da API com cache em disco e memória (expo-image), carregamento progressivo (fundo neutro + fade de 200 ms) e
 * tamanho adequado à tela. Falhou ou não existe: placeholder neutro, sem ícone quebrado (§5 do design system).
 */
export function RemoteImage({ urls, width, height, aspectRatio, alt, radius = theme.radius.lg, priority = 'normal', fallback, style, testID }: RemoteImageProps) {
  const uri = pickImageUrl(urls, width);
  const [failedUri, setFailedUri] = useState<string | undefined>(undefined);
  const showImage = Boolean(uri) && failedUri !== uri;
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
      {showImage ? (
        <Image
          accessibilityLabel={alt}
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => setFailedUri(uri)}
          priority={priority}
          recyclingKey={uri}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          transition={200}
        />
      ) : fallback ? (
        <Fallback box={Math.min(width, height ?? (aspectRatio ? width / aspectRatio : width))} fallback={fallback} />
      ) : (
        <ImageIcon color={theme.color.neutral[400]} size={theme.size.iconMd} />
      )}
    </View>
  );
}

function Fallback({ fallback, box }: { fallback: ImageFallback; box: number }) {
  if ('node' in fallback) return <>{fallback.node}</>;
  if ('initials' in fallback) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: fallback.background ?? theme.color.neutral[0] }]} testID="image.fallback-initials">
        <Text allowFontScaling={false} style={{ color: fallback.color, fontSize: Math.round(box * 0.4), letterSpacing: -0.5 }} variant="title2">
          {fallback.initials}
        </Text>
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: fallback.background ?? theme.color.surface.sunken }]} testID="image.fallback-art">
      <ProductArt color={fallback.color ?? artColorFor(fallback.seed ?? fallback.art)} ground={fallback.ground ?? 'rgba(28, 23, 33, 0.16)'} name={fallback.art} size={Math.round(box * 0.86)} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  box: { backgroundColor: theme.color.surface.sunken, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
