import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { cancelMyDeletion } from '../../api/privacy-api';
import { ApiError } from '../../api/problem';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { theme } from '../../theme';

/**
 * Arrependimento: reativa a conta com e-mail e senha enquanto o prazo vale. Qualquer falha responde igual ao login (o servidor não
 * revela se a conta existe nem se está em exclusão): a tela diz uma frase só. Rota pública.
 */
export function CancelDeletionForm({ initialEmail = '', onDone }: { initialEmail?: string; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) {
      setError(t('privacy.undoWrong'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelMyDeletion(email, password);
      toast.show(t('privacy.undoDone'));
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.isConnectivity ? t('privacy.offlineAction') : e instanceof ApiError && e.status === 429 ? t('privacy.tooMany') : t('privacy.undoWrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form} testID="account.undo-form">
      <TextField autoCapitalize="none" autoComplete="email" inputMode="email" keyboardType="email-address" label={t('privacy.undoEmail')} onChangeText={setEmail} testID="account.undo-email-input" value={email} />
      <PasswordField label={t('privacy.undoPassword')} mode="current" onChangeText={setPassword} onToggleVisible={() => setVisible((v) => !v)} testID="account.undo-password-input" value={password} visible={visible} />
      {error ? <Banner testID="account.undo-error" text={error} tone="danger" /> : null}
      <Button label={t('privacy.undoSubmit')} loading={busy} onPress={() => void submit()} size="lg" testID="account.undo-submit" />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: theme.space[3], alignSelf: 'stretch' } });
