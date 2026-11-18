import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  actionTestID?: string;
}

/** Título de seção como cabeçalho (leitor de tela navega por títulos) + "Ver todas". */
export function SectionHeader({ title, actionLabel, onAction, testID, actionTestID }: SectionHeaderProps) {
  return (
    <View style={styles.row} testID={testID}>
      <Text accessibilityRole="header" style={styles.title} variant="title2">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={`${actionLabel}, ${title}`}
          accessibilityRole="button"
          hitSlop={theme.hitSlopFor(theme.size.iconMd)}
          onPress={onAction}
          style={styles.action}
          testID={actionTestID}
        >
          <Text color="link" variant="label">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[3] },
  title: { flex: 1 },
  action: { minHeight: theme.size.touchMin, justifyContent: 'center' },
});
