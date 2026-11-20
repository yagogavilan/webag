import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { changeUnverifiedEmail, confirmEmail, resendCode } from '../../src/api/auth-api';
import { ApiError } from '../../src/api/problem';
import { useSession } from '../../src/api/session';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { PasswordField } from '../../src/components/PasswordField';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { useToast } from '../../src/components/Toast';
import { OtpEntry } from '../../src/features/auth/OtpEntry';
import { correctEmailSchema, type CorrectEmailForm } from '../../src/features/auth/schemas';
import { t } from '../../src/i18n';
import { haptic } from '../../src/lib/haptics';
import { useOnline } from '../../src/lib/useOnline';

/**
 * E4 (finalidade `signup_verify`) e E5c (corrigir e-mail). Abre pelo banner "Confirme seu e-mail" depois da 1ª compra
 * ou quando uma ação limitada pede confirmação (DEC-014). Nunca está no caminho do cadastro (DEC-015).
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const session = useSession();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [view, setView] = useState<'code' | 'correct'>(mode === 'correct' ? 'correct' : 'code');
  const [cycle, setCycle] = useState(0);
  const email = session.status === 'authenticated' ? session.user.email : '';

  const finish = () => {
    toast.show(t('email.verified'));
    void queryClient.invalidateQueries({ queryKey: ['me'] });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (view === 'correct') {
    return (
      <CorrectEmail
        onBack={() => setView('code')}
        onDone={(newEmail) => {
          toast.show(t('email.correctSent', { email: newEmail }));
          setCycle((c) => c + 1); // reinicia a tela de código e a contagem de reenvio
          setView('code');
        }}
      />
    );
  }

  return (
    <Screen header={<Header title={t('otp.verifyTitle')} />}>
      <OtpEntry
        key={cycle}
        onChangeEmail={() => setView('correct')}
        onDone={finish}
        onResend={async () => {
          try {
            await resendCode();
          } catch (error) {
            // já confirmado em outro aparelho: segue como sucesso
            if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_VERIFIED') finish();
            else throw error;
          }
        }}
        onVerify={confirmEmail}
        text={t('otp.verifyText', { email })}
        title={t('otp.verifyTitle')}
      />
    </Screen>
  );
}

function CorrectEmail({ onBack, onDone }: { onBack: () => void; onDone: (email: string) => void }) {
  const online = useOnline();
  const [banner, setBanner] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { control, handleSubmit, setError, setFocus } = useForm<CorrectEmailForm>({
    resolver: zodResolver(correctEmailSchema),
    mode: 'onTouched',
    defaultValues: { newEmail: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (v: CorrectEmailForm) => changeUnverifiedEmail(v.newEmail, v.password),
    onSuccess: (email) => {
      void haptic('success');
      onDone(email);
    },
    onError: (error) => {
      void haptic('error');
      if (error instanceof ApiError) {
        if (error.code === 'INVALID_PASSWORD') {
          setError('password', { message: t('email.correctWrongPassword') });
          setFocus('password');
          return;
        }
        if (error.code === 'EMAIL_ALREADY_REGISTERED') {
          setError('newEmail', { message: t('signup.emailTaken') });
          setFocus('newEmail');
          return;
        }
        if (error.status === 429) {
          setBanner(t('signup.rateLimit'));
          return;
        }
      }
      setBanner(t('login.networkError'));
    },
  });

  const submit = handleSubmit((values) => {
    setBanner(null);
    if (!online) {
      setBanner(t('signup.offline'));
      return;
    }
    mutation.mutate(values);
  });

  return (
    <Screen
      footer={<Button label={t('email.correctSubmit')} loading={mutation.isPending} onPress={() => void submit()} size="lg" testID="auth.email-correct-submit" />}
      header={<Header onBack={onBack} title={t('email.correct')} />}
    >
      <Text color="secondary">{t('email.correctHint')}</Text>
      <Controller
        control={control}
        name="newEmail"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={fieldState.error?.message}
            keyboardType="email-address"
            label={t('email.correctNew')}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => setFocus('password')}
            ref={field.ref}
            returnKeyType="next"
            testID="auth.email-correct-new-input"
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <PasswordField
            error={fieldState.error?.message}
            label={t('email.correctPassword')}
            mode="current"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => void submit()}
            onToggleVisible={() => setShowPassword((v) => !v)}
            ref={field.ref}
            returnKeyType="done"
            testID="auth.email-correct-password-input"
            value={field.value}
            visible={showPassword}
          />
        )}
      />
      {banner ? <Banner text={banner} tone="danger" /> : null}
    </Screen>
  );
}
