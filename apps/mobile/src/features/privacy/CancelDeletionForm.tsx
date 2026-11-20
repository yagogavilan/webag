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
import { maskEmail } from '../../lib/email';
import { withMinDuration } from '../../lib/minDuration';
import { theme } from '../../theme';
import { OtpEntry } from '../auth/OtpEntry';

/**
 * Arrependimento: reativa a conta com e-mail e senha enquanto o prazo vale. Qualquer falha responde igual ao login (o servidor não
 * revela se a conta existe nem se está em exclusão): a tela diz uma frase só. Rota pública.
 *
 * Sob ataque (SEC-168/176) o servidor responde 403 `LOGIN_CODE_REQUIRED` com a senha certa e manda um código de 6 dígitos ao e-mail:
 * a tela pede o código e repete a chamada com `code`. Reenviar = repetir sem `code`. Senha errada é 401 com ou sem código.
 */
export function CancelDeletionForm({ initialEmail = '', onDone }: { initialEmail?: string; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<{ email: string; password: string } | null>(null);

  const finish = () => {
    toast.show(t('privacy.undoDone'));
    onDone();
  };

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
      finish();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LOGIN_CODE_REQUIRED') {
        setStep({ email: email.trim().toLowerCase(), password });
      } else {
        setError(e instanceof ApiError && e.isConnectivity ? t('privacy.offlineAction') : e instanceof ApiError && e.status === 429 ? t('privacy.tooMany') : t('privacy.undoWrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (step) {
    return (
      <View style={styles.form} testID="account.undo-code">
        <OtpEntry
          onDone={finish}
          onResend={async () => {
            try {
              await cancelMyDeletion(step.email, step.password);
              finish();
            } catch (e) {
              if (!(e instanceof ApiError && e.code === 'LOGIN_CODE_REQUIRED')) throw e;
            }
          }}
          onVerify={async (code) => {
            try {
              await withMinDuration(cancelMyDeletion(step.email, step.password, code), 300);
            } catch (e) {
              // 401: a senha deixou de valer ou o prazo acabou; o código não resolve, volta ao formulário com a frase única
              if (e instanceof ApiError && e.status === 401) {
                setStep(null);
                setError(t('privacy.undoWrong'));
              }
              throw e;
            }
          }}
          text={t('privacy.undoCodeText', { email: maskEmail(step.email) })}
          title={t('privacy.undoCodeTitle')}
        />
      </View>
    );
  }

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
