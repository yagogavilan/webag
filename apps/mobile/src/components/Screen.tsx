import { type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { OfflineBanner } from './OfflineBanner';

const TABLET_MIN_WIDTH = 600;

export interface ScreenProps {
  header?: ReactNode;
  /** Rodapé fixo acima do teclado (botão `lg` de formulário). No tablet fica no fim do conteúdo, não fixo. */
  footer?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  showOfflineBanner?: boolean;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  /** Padding e espaçamento padrão do conteúdo. `false` para telas cuja lista (FlashList) cuida do próprio espaçamento. */
  padded?: boolean;
  /** `false` dentro das abas: a barra de abas já cuida da área segura de baixo. */
  bottomInset?: boolean;
  testID?: string;
}

/**
 * Casca de toda tela: safe areas (Android edge-to-edge e iOS), teclado sem cobrir o campo, rolagem, tablet com coluna de 480.
 * No Android 15+ (edge-to-edge) `adjustResize` não age: por isso `padding` nas duas plataformas.
 */
export function Screen({
  header,
  footer,
  children,
  scroll = true,
  showOfflineBanner = true,
  keyboardShouldPersistTaps = 'handled',
  padded = true,
  bottomInset = true,
  testID,
}: ScreenProps) {
  const { width } = useWindowDimensions();
  const tablet = width >= TABLET_MIN_WIDTH;
  const column = tablet ? styles.column : undefined;

  return (
    <SafeAreaView edges={bottomInset ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']} style={styles.safe} testID={testID}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={[styles.flex, column]}>
          {header}
          {showOfflineBanner ? <OfflineBanner /> : null}
          {scroll ? (
            <ScrollView
              contentContainerStyle={padded ? styles.content : styles.grow}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps={keyboardShouldPersistTaps}
              style={styles.flex}
            >
              {children}
              {tablet ? footer : null}
            </ScrollView>
          ) : (
            <View style={[styles.flex, padded && styles.content]}>{children}</View>
          )}
          {tablet && !scroll && footer ? <View style={styles.footer}>{footer}</View> : null}
          {!tablet && footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface.background },
  flex: { flex: 1 },
  column: { width: '100%', maxWidth: theme.layout.formMaxWidth, alignSelf: 'center' },
  grow: { flexGrow: 1 },
  content: { padding: theme.layout.screenPaddingX, gap: theme.space[4], flexGrow: 1 },
  footer: {
    paddingHorizontal: theme.layout.screenPaddingX,
    paddingTop: theme.space[2],
    paddingBottom: theme.space[3],
    gap: theme.space[2],
    backgroundColor: theme.color.surface.background,
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.color.border.subtle,
  },
});
