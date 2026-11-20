import { useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { CancelDeletionForm } from '../src/features/privacy/CancelDeletionForm';
import { t } from '../src/i18n';

/** Arrependimento da exclusão de conta (SEC-166): rota pública, e-mail e senha. Alcançada pela tela de entrada e pelo aviso da exclusão. */
export default function CancelDeletionScreen() {
  const router = useRouter();
  return (
    <Screen header={<Header title={t('privacy.undoTitle')} />} testID="account.undo-screen">
      <Text color="secondary">{t('privacy.undoText')}</Text>
      <CancelDeletionForm onDone={() => router.replace('/login')} />
    </Screen>
  );
}
