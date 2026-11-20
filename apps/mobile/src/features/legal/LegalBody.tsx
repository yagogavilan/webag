import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { fillLegal, parseLegal, type LegalContext } from './legal-text';

/** Corpo do texto legal: títulos como cabeçalhos (leitor de tela navega por seção), parágrafos e lista com marcador. Texto puro. */
export function LegalBody({ content, version, siteUrl, effectiveAt, reviewed }: { content: string } & LegalContext) {
  const blocks = useMemo(() => parseLegal(fillLegal(content, { version, siteUrl, effectiveAt, reviewed })), [content, version, siteUrl, effectiveAt, reviewed]);
  return (
    <View style={styles.body}>
      {blocks.map((block, i) =>
        block.kind === 'h2' ? (
          <Text accessibilityRole="header" key={i} style={styles.h2} variant="title2">{block.text}</Text>
        ) : block.kind === 'h3' ? (
          <Text accessibilityRole="header" key={i} style={styles.h3} variant="bodyStrong">{block.text}</Text>
        ) : block.kind === 'li' ? (
          <View key={i} style={styles.li}>
            <Text accessible={false} importantForAccessibility="no">{'•'}</Text>
            <Text style={styles.liText}>{block.text}</Text>
          </View>
        ) : (
          <Text key={i}>{block.text}</Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.space[3] },
  h2: { marginTop: theme.space[3] },
  h3: { marginTop: theme.space[1] },
  li: { flexDirection: 'row', gap: theme.space[2], paddingLeft: theme.space[1] },
  liText: { flex: 1 },
});
