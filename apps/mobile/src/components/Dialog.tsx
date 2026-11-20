import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './Text';

export interface DialogProps {
  visible: boolean;
  title: string;
  text?: string;
  onClose: () => void;
  /** Botões empilhados (primário no topo). */
  children: ReactNode;
  testID?: string;
}

/**
 * Diálogo modal (§3.1). Botão voltar do Android e toque no fundo fecham (`onClose`). Ações destrutivas nunca são a 1ª opção visual.
 */
export function Dialog({ visible, title, text, onClose, children, testID }: DialogProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onClose} style={styles.backdrop} />
      <View pointerEvents="box-none" style={styles.center}>
        <View accessibilityViewIsModal style={styles.card} testID={testID}>
          <ScrollView bounces={false} contentContainerStyle={styles.content}>
            <Text variant="title2">{title}</Text>
            {text ? <Text color="secondary">{text}</Text> : null}
            <View style={styles.actions}>{children}</View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: theme.color.overlay.backdrop },
  center: { flex: 1, justifyContent: 'center', padding: theme.layout.screenPaddingX },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.formMaxWidth,
    maxHeight: '90%',
    backgroundColor: theme.color.surface.card,
    borderRadius: theme.radius.xl,
    ...theme.shadows.lg,
  },
  content: { padding: theme.space[5], gap: theme.space[3] },
  actions: { gap: theme.space[2], paddingTop: theme.space[2] },
});
