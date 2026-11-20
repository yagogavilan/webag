import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';
import { Text } from './Text';

/** Selo de oferta "-17%": raio 7, inclinado -8 graus, texto noite desinclinado (15,3:1). Oferta só com o preço antigo visível ao lado. */
export function OfferSeal({ label, style, testID }: { label: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View accessible accessibilityLabel={label} style={[styles.seal, { transform: [{ skewX: `${theme.shape.lean}deg` }] }, style]} testID={testID}>
      <Text allowFontScaling={false} style={[styles.sealText, { transform: [{ skewX: `${-theme.shape.lean}deg` }] }]} variant="sticker">
        {label}
      </Text>
    </View>
  );
}

/**
 * Adesivo ("Mais pedida"): raio 8, giro de -6 a +8 graus e sombra dura 3/3 em noite, feita com uma cópia deslocada
 * (sem `shadowRadius`: sombra com desfoque custa GPU em lista no Android). No máximo 1 por dobra.
 */
export function Sticker({ label, rotate = -6, style, children, testID }: { label?: string; rotate?: number; style?: StyleProp<ViewStyle>; children?: ReactNode; testID?: string }) {
  const off = theme.hardShadow.offset;
  return (
    <View accessible accessibilityLabel={label} style={[{ transform: [{ rotate: `${rotate}deg` }] }, style]} testID={testID}>
      <View style={[styles.stickerShadow, { left: off, top: off }]} />
      <View style={styles.sticker}>
        {children ?? (
          <Text allowFontScaling={false} style={styles.stickerText} variant="sticker">
            {label}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Marca-texto: bloco lima inclinado atrás da palavra-chave do título; a palavra fica em noite (15,3:1). */
export function Highlight({ children, variant = 'poster' }: { children: string; variant?: 'poster' | 'display' | 'hero' }) {
  return (
    <View style={styles.hl}>
      <View style={styles.hlBlock} />
      <Text color="primary" style={styles.hlText} variant={variant}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seal: { backgroundColor: theme.color.accent.base, borderRadius: theme.radius.seal, paddingHorizontal: 9, paddingVertical: 6, alignSelf: 'flex-start' },
  sealText: { color: theme.color.accent.onBase },
  sticker: { backgroundColor: theme.color.accent.base, borderRadius: theme.radius.sticker, paddingHorizontal: 11, paddingVertical: 8 },
  stickerShadow: { position: 'absolute', right: -theme.hardShadow.offset, bottom: -theme.hardShadow.offset, backgroundColor: theme.color.surface.ink, borderRadius: theme.radius.sticker },
  stickerText: { color: theme.color.accent.onBase },
  hl: { alignSelf: 'flex-start', paddingHorizontal: 5 },
  hlBlock: { position: 'absolute', left: 0, right: 0, bottom: 4, height: '58%', backgroundColor: theme.color.accent.base, borderRadius: 6, transform: [{ skewX: `${theme.shape.lean}deg` }] },
  hlText: { color: theme.color.accent.onBase },
});
