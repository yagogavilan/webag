import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, StyleSheet, View } from 'react-native';
import { signIn } from '../../src/api/auth-api';
import { ApiError } from '../../src/api/problem';
import { useSession } from '../../src/api/session';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Logo } from '../../src/components/Logo';
import { PasswordField } from '../../src/components/PasswordField';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { OtpEntry } from '../../src/features/auth/OtpEntry';
import { safeReturnTo, setEmailPrefill, takeEmailPrefill } from '../../src/features/auth/return-to';
import { loginSchema, type LoginForm } from '../../src/features/auth/schemas';
import { t } from '../../src/i18n';
import { maskEmail } from '../../src/lib/email';
import { formatClock } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import { withMinDuration } from '../../src/lib/minDuration';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/** Número do suporte por WhatsApp (só dígitos, com DDI). Público por natureza; vem do ambiente. Sem ele, o botão não aparece. */
const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '';

type View_ = { name: 'form' } | { name: 'stepup'; email: string; password: string } | { name: 'blocked' };

/** E2. Entrar (WB-008, 219 a 221). Login do cliente é de 1 passo; o único segundo passo é o código por e-mail (step-up). */
export default function LoginScreen() {
  const router = useRouter();
  const online = useOnline();
  const session = useSession();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [view, setView] = useState<View_>({ name: 'form' });
  const [showPassword, setShowPassword] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'danger' | 'warning'; text: string; retry?: boolean } | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);

  const { control, handleSubmit, setFocus, getValues } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: takeEmailPrefill(), password: '' },
  });

  // a espera termina sozinha no horário mostrado ao usuário
  useEffect(() => {
    if (waitUntil === null) return;
    const timer = setTimeout(() => setWaitUntil(null), Math.max(0, waitUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [waitUntil]);

  const enter = () => {
    void haptic('success');
    router.replace(safeReturnTo(returnTo) as never);
  };

  const mutation = useMutation({
    mutationFn: (v: LoginForm) => withMinDuration(signIn(v)),
    onSuccess: enter,
    onError: (error, values) => {
      void haptic('error');
      if (error instanceof ApiError) {
        if (error.code === 'LOGIN_CODE_REQUIRED') {
          setView({ name: 'stepup', email: values.email.trim().toLowerCase(), password: values.password });
          return;
        }
        if (error.code === 'ACCOUNT_BLOCKED') {
          setView({ name: 'blocked' });
          return;
        }
        if (error.status === 429) {
          setWaitUntil(Date.now() + (error.retryAfter ?? 15 * 60) * 1000);
          setBanner(null);
          return;
        }
        if (error.status === 401 || error.status === 400) {
          setBanner({ tone: 'danger', text: t('login.invalid') });
          setFocus('password'); // a senha NÃO limpa: o usuário costuma errar uma letra
          return;
        }
      }
      setBanner({ tone: 'danger', text: t('login.networkError'), retry: true });
    },
  });

  const submit = handleSubmit(
    (values) => {
      setBanner(null);
      if (!online) {
        setBanner({ tone: 'warning', text: t('login.offline') });
        return;
      }
      mutation.mutate(values);
    },
    () => void haptic('error'),
  );

  if (view.name === 'blocked') {
    return (
      <Screen header={<Header onBack={() => setView({ name: 'form' })} title={t('login.title')} />}>
        <View style={styles.blocked} testID="auth.blocked">
          <Text variant="title2">{t('login.blockedTitle')}</Text>
          <Text color="secondary">{t('login.blockedText')}</Text>
          {SUPPORT_WHATSAPP ? (
            <Button label={t('login.support')} onPress={() => void Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)} size="lg" testID="auth.blocked-support" />
          ) : null}
        </View>
      </Screen>
    );
  }

  if (view.name === 'stepup') {
    const { email, password } = view;
    return (
      <Screen header={<Header onBack={() => setView({ name: 'form' })} title={t('otp.stepupTitle')} />}>
        <OtpEntry
          onDone={enter}
          onResend={async () => {
            // repetir o login sem código faz o servidor enviar outro código e responder LOGIN_CODE_REQUIRED de novo
            try {
              await signIn({ email, password });
              enter();
            } catch (error) {
              if (!(error instanceof ApiError && error.code === 'LOGIN_CODE_REQUIRED')) throw error;
            }
          }}
          onVerify={(code) => withMinDuration(signIn({ email, password, code }), 300)}
          text={t('otp.stepupText', { email: maskEmail(email) })}
          title={t('otp.stepupTitle')}
        />
      </Screen>
    );
  }

  const waiting = waitUntil !== null;
  const sessionNotice =
    session.status === 'anonymous' && session.notice
      ? session.notice === 'reused'
        ? { title: t('login.sessionReusedTitle'), text: t('login.sessionReusedText') }
        : { title: t('login.sessionExpiredTitle'), text: t('login.sessionExpiredText') }
      : null;

  return (
    <Screen
      footer={
        <Button
          disabled={waiting}
          label={waiting && waitUntil ? t('login.waitButton', { time: formatClock(waitUntil) }) : t('login.submit')}
          loading={mutation.isPending}
          loadingLabel={t('login.submitting')}
          onPress={() => void submit()}
          size="lg"
          testID="auth.login-submit"
        />
      }
      header={
        <Header
          right={<Button label={t('login.createAccount')} onPress={() => router.replace('/signup')} testID="auth.go-signup" variant="text" />}
          title={t('login.title')}
        />
      }
    >
      <View style={styles.logo}>
        <Logo height={32} />
      </View>
      {sessionNotice ? (
        <Banner
          testID="auth.session-notice"
          text={`${sessionNotice.title}. ${sessionNotice.text}`}
          tone="warning"
        />
      ) : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={fieldState.error?.message}
            keyboardType="email-address"
            label={t('login.email')}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => setFocus('password')}
            ref={field.ref}
            returnKeyType="next"
            testID="auth.login-email-input"
            textContentType="emailAddress"
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
            label={t('password.label')}
            mode="current"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => void submit()}
            onToggleVisible={() => setShowPassword((v) => !v)}
            ref={field.ref}
            returnKeyType="done"
            testID="auth.login-password-input"
            value={field.value}
            visible={showPassword}
          />
        )}
      />
      <Button
        label={t('login.forgot')}
        onPress={() => {
          setEmailPrefill(getValues('email'));
          router.push('/forgot-password');
        }}
        style={styles.forgot}
        testID="auth.forgot-password"
        variant="text"
      />
      {/* Arrependimento da exclusão de conta (SEC-166): só vale dentro do prazo; rota pública */}
      <Button label={t('login.undoDeletion')} onPress={() => router.push('/cancel-deletion' as never)} style={styles.forgot} testID="auth.cancel-deletion" variant="text" />

      {banner ? (
        <Banner
          testID="auth.login-error"
          text={banner.text}
          tone={banner.tone}
          {...(banner.retry ? { actionLabel: t('common.tryAgain'), onAction: () => void submit() } : {})}
        />
      ) : null}

      {waiting && waitUntil ? (
        <View style={styles.wait} testID="auth.login-wait-banner">
          <Banner text={`${t('login.waitTitle')}. ${t('login.waitText', { time: formatClock(waitUntil) })}`} tone="warning" />
          <Button
            label={t('login.resetPassword')}
            onPress={() => {
              setEmailPrefill(getValues('email'));
              router.push('/forgot-password');
            }}
            testID="auth.login-reset-from-wait"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'flex-start', paddingVertical: theme.space[2] },
  forgot: { alignSelf: 'flex-start' },
  wait: { gap: theme.space[3] },
  blocked: { gap: theme.space[3], paddingTop: theme.space[6] },
});
