import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { theme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Ação principal fixa no rodapé, acima do teclado (ex.: "Ver 23 resultados"). */
  footer?: ReactNode;
  /** Esconde o botão "Fechar" quando o rodapé já tem a ação. */
  hideClose?: boolean;
  children: ReactNode;
  testID?: string;
}

/**
 * Folha inferior (§3.1): raio 24 no topo, alça decorativa, título, "Fechar" visível de 48 e altura máx. de 90%.
 * Fecha por toque fora, botão Fechar e voltar do Android. Arrastar para fechar é só atalho: o botão é a alternativa visível.
 */
export function BottomSheet({ visible, title, onClose, footer, hideClose, children, testID }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onClose} style={styles.backdrop} />
      <View pointerEvents="box-none" style={styles.bottom}>
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.space[3]) }]} testID={testID}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.title} variant="title2">
              {title}
            </Text>
            {hideClose ? null : <Button label={t('common.close')} onPress={onClose} testID="sheet.close" variant="text" />}
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: theme.color.overlay.backdrop },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.formMaxWidth + theme.space[8],
    maxHeight: '90%',
    backgroundColor: theme.color.surface.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    ...theme.shadows.lg,
  },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: theme.radius.full, backgroundColor: theme.color.border.default, marginTop: theme.space[2] },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: theme.layout.screenPaddingX, paddingRight: theme.space[2] },
  title: { flex: 1, paddingVertical: theme.space[2] },
  scroll: { flexGrow: 0 },
  content: { padding: theme.layout.screenPaddingX, gap: theme.space[3] },
  footer: { paddingHorizontal: theme.layout.screenPaddingX, paddingTop: theme.space[2], gap: theme.space[2], borderTopWidth: theme.borderWidth.hairline, borderTopColor: theme.color.border.subtle },
});
