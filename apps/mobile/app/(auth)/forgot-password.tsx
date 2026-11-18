import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { BackHandler } from 'react-native';
import { requestPasswordCode, resetPasswordWithCode } from '../../src/api/auth-api';
import { ApiError } from '../../src/api/problem';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { PasswordField } from '../../src/components/PasswordField';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { useToast } from '../../src/components/Toast';
import { weakPasswordMessage } from '../../src/features/auth/errors';
import { OtpEntry } from '../../src/features/auth/OtpEntry';
import { safeReturnTo, takeEmailPrefill } from '../../src/features/auth/return-to';
import { forgotEmailSchema, resetPasswordSchema, type ResetPasswordForm } from '../../src/features/auth/schemas';
import { t } from '../../src/i18n';
import { haptic } from '../../src/lib/haptics';
import { useOnline } from '../../src/lib/useOnline';

type Step = 1 | 2 | 3;

/**
 * E3. Esqueci a senha: uma rota, 3 vistas (e-mail, código, nova senha). "Passo N de 3" em texto no header.
 * O servidor só confere o código na chamada final (`/password/reset`); por isso a vista 2 guarda o código e a 3 o envia junto.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState(takeEmailPrefill);
  const [code, setCode] = useState('');
  const [codeNotice, setCodeNotice] = useState<string | undefined>();
  const [cycle, setCycle] = useState(0);

  // voltar do sistema (Android) desce uma vista antes de sair da rota
  useEffect(() => {
    if (step === 1) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep((s) => (s === 3 ? 2 : 1));
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const stepLabel = t('forgot.step', { n: step });

  if (step === 1) {
    return (
      <EmailStep
        email={email}
        header={<Header subtitle={stepLabel} title={t('forgot.title1')} />}
        onSent={(value) => {
          setEmail(value);
          setCodeNotice(undefined);
          setCycle((c) => c + 1);
          setStep(2);
        }}
        online={online}
      />
    );
  }

  if (step === 2) {
    return (
      <Screen header={<Header onBack={() => setStep(1)} subtitle={stepLabel} title={t('otp.resetTitle')} />}>
        <OtpEntry
          externalMessage={codeNotice}
          key={cycle}
          onDone={() => setStep(3)}
          onResend={async () => {
            await requestPasswordCode(email);
          }}
          onVerify={async (value) => {
            setCode(value);
          }}
          text={t('otp.resetText')}
          title={t('otp.resetTitle')}
        />
      </Screen>
    );
  }

  return (
    <NewPasswordStep
      header={<Header onBack={() => setStep(2)} subtitle={stepLabel} title={t('forgot.title3')} />}
      online={online}
      onCodeRejected={(expired) => {
        setCode('');
        setCodeNotice(expired ? t('forgot.codeExpired') : t('forgot.codeWrong'));
        setCycle((c) => c + 1);
        setStep(2);
      }}
      onDone={(signedIn) => {
        void haptic('success');
        toast.show(signedIn ? t('forgot.done') : t('forgot.doneNoSession'));
        router.replace(signedIn ? (safeReturnTo(returnTo) as never) : '/login');
      }}
      resetArgs={{ email, code }}
    />
  );
}

function EmailStep({ email, header, online, onSent }: { email: string; header: ReactNode; online: boolean; onSent: (email: string) => void }) {
  const [banner, setBanner] = useState<string | null>(null);
  const { control, handleSubmit } = useForm<{ email: string }>({
    resolver: zodResolver(forgotEmailSchema),
    mode: 'onTouched',
    defaultValues: { email },
  });

  const mutation = useMutation({
    mutationFn: (v: { email: string }) => requestPasswordCode(v.email),
    // mesma resposta para e-mail existente ou não (SEC-003): sempre avança
    onSuccess: (_data, v) => onSent(v.email.trim().toLowerCase()),
    onError: (error) => {
      void haptic('error');
      setBanner(error instanceof ApiError && error.status === 429 ? t('forgot.limit') : t('forgot.network'));
    },
  });

  const submit = handleSubmit(
    (v) => {
      setBanner(null);
      if (!online) {
        setBanner(t('forgot.offlineSend'));
        return;
      }
      mutation.mutate(v);
    },
    () => void haptic('error'),
  );

  return (
    <Screen
      footer={<Button label={t('forgot.send')} loading={mutation.isPending} loadingLabel={t('forgot.sending')} onPress={() => void submit()} size="lg" testID="auth.reset-send-code" />}
      header={header}
    >
      <Text color="secondary">{t('forgot.text1')}</Text>
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            autoFocus={email === ''}
            error={fieldState.error?.message}
            keyboardType="email-address"
            label={t('login.email')}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => void submit()}
            ref={field.ref}
            returnKeyType="done"
            testID="auth.reset-email-input"
            textContentType="emailAddress"
            value={field.value}
          />
        )}
      />
      {banner ? <Banner text={banner} tone="danger" /> : null}
    </Screen>
  );
}

function NewPasswordStep({
  header,
  online,
  resetArgs,
  onCodeRejected,
  onDone,
}: {
  header: ReactNode;
  online: boolean;
  resetArgs: { email: string; code: string };
  onCodeRejected: (expired: boolean) => void;
  onDone: (signedIn: boolean) => void;
}) {
  const [show, setShow] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const { control, handleSubmit, setError, setFocus, getValues, trigger } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  });

  const mutation = useMutation({
    mutationFn: (v: ResetPasswordForm) => resetPasswordWithCode({ ...resetArgs, newPassword: v.password }),
    onSuccess: onDone,
    onError: (error) => {
      void haptic('error');
      if (error instanceof ApiError) {
        if (error.code === 'CODE_EXPIRED') return onCodeRejected(true);
        if (error.code === 'CODE_INVALID') return onCodeRejected(false);
        if (error.code === 'WEAK_PASSWORD') {
          setError('password', { message: weakPasswordMessage(error) });
          setFocus('password');
          return;
        }
        if (error.status === 429) {
          setBanner(t('forgot.limit'));
          return;
        }
      }
      setBanner(t('forgot.network'));
    },
  });

  const submit = handleSubmit(
    (v) => {
      setBanner(null);
      if (!online) {
        setBanner(t('forgot.offlineSave'));
        return;
      }
      mutation.mutate(v);
    },
    () => void haptic('error'),
  );

  return (
    <Screen
      footer={<Button label={t('forgot.submit')} loading={mutation.isPending} loadingLabel={t('forgot.saving')} onPress={() => void submit()} size="lg" testID="auth.reset-submit" />}
      header={header}
    >
      <Text variant="title1">{t('forgot.title3')}</Text>
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <PasswordField
            error={fieldState.error?.message}
            label={t('password.label')}
            mode="new"
            onBlur={field.onBlur}
            onChangeText={(v) => {
              field.onChange(v);
              if (getValues('confirm').length === v.length) void trigger('confirm');
            }}
            onSubmitEditing={() => setFocus('confirm')}
            onToggleVisible={() => setShow((v) => !v)}
            ref={field.ref}
            returnKeyType="next"
            showMeter
            testID="auth.reset-password-input"
            value={field.value}
            visible={show}
          />
        )}
      />
      <Controller
        control={control}
        name="confirm"
        render={({ field, fieldState }) => (
          <PasswordField
            error={fieldState.error?.message}
            label={t('password.confirmLabel')}
            mode="new"
            onBlur={field.onBlur}
            onChangeText={(v) => {
              field.onChange(v);
              if (v.length === getValues('password').length) void trigger('confirm');
            }}
            onSubmitEditing={() => void submit()}
            ref={field.ref}
            returnKeyType="done"
            testID="auth.reset-password-confirm-input"
            value={field.value}
            visible={show}
          />
        )}
      />
      {banner ? <Banner text={banner} tone="danger" /> : null}
    </Screen>
  );
}
