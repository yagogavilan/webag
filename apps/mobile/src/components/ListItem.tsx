import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { CaretRight, type IconComponent } from './icons';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: IconComponent;
  onPress: () => void;
  testID?: string;
}

/** ListItem (§3.1): linha inteira é o alvo (≥ 56), ícone de 24 à esquerda, título e subtítulo, seta à direita. */
export function ListItem({ title, subtitle, icon: Icon, onPress, testID }: ListItemProps) {
  return (
    <Pressable
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityRole="button"
      android_ripple={{ color: theme.color.action.primarySubtlePressed }}
      onPress={onPress}
      style={styles.row}
      testID={testID}
    >
      {Icon ? <Icon color={theme.color.text.brand} size={theme.size.iconMd} /> : null}
      <View style={styles.texts}>
        <Text>{title}</Text>
        {subtitle ? (
          <Text color="secondary" variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <CaretRight color={theme.color.text.secondary} size={theme.size.iconSm} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingVertical: theme.space[2],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.color.border.subtle,
  },
  texts: { flex: 1 },
});
