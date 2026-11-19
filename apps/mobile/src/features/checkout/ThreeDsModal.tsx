import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';

/**
 * Desafio 3DS do banco (S4, C4) dentro do app. A página é do provedor/banco; o app só a exibe, em HTTPS, sem JavaScript do app
 * injetado e sem aceitar outro esquema. O resultado NÃO vem daqui: ao fechar, o app volta a ler o status no servidor.
 */
export function ThreeDsModal({ url, visible, onClose }: { url: string | null; visible: boolean; onClose: () => void }) {
  const safe = url !== null && url.startsWith('https://');
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible && safe}>
      <SafeAreaView style={styles.safe} testID="card.3ds">
        <View style={styles.bar}>
          <Text accessibilityRole="header" variant="title2">{t('card.threeDsTitle')}</Text>
          <Button label={t('card.threeDsCancel')} onPress={onClose} testID="card.3ds-cancel" variant="text" />
        </View>
        {safe ? (
          <WebView
            incognito
            onShouldStartLoadWithRequest={(req) => req.url.startsWith('https://') || req.url === 'about:blank'}
            originWhitelist={['https://*']}
            setSupportMultipleWindows={false}
            source={{ uri: url }}
            style={styles.web}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface.card },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.space[3] },
  web: { flex: 1 },
});
