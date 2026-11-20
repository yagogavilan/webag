import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { signUp } from '../../src/api/auth-api';
import { ApiError } from '../../src/api/problem';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Checkbox } from '../../src/components/Checkbox';
import { Header } from '../../src/components/Header';
import { PasswordField } from '../../src/components/PasswordField';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { useToast } from '../../src/components/Toast';
import { weakPasswordMessage } from '../../src/features/auth/errors';
import { safeReturnTo, setEmailPrefill } from '../../src/features/auth/return-to';
import { signupSchema, type SignupForm } from '../../src/features/auth/schemas';
import { t } from '../../src/i18n';
import { suggestEmailDomain } from '../../src/lib/email';
import { haptic } from '../../src/lib/haptics';
import { maskPhone } from '../../src/lib/masks';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/** E1. Criar conta (WB-006, WB-210; DEC-012: confirmar senha; DEC-015: sem tela de código no caminho). */
export default function SignupScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const { returnTo, context } = useLocalSearchParams<{ returnTo?: string; context?: string }>();

  /** "Já tenho conta" leva o destino junto: quem veio da Sacola entra e cai no checkout, não no Início. */
  const goLogin = () => router.replace((returnTo ? { pathname: '/login', params: { returnTo } } : '/login') as never);

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', phone: '', password: '', confirm: '', terms: false },
  });
  const { control, handleSubmit, setError, setValue, setFocus, getValues, trigger } = form;

  const [showPassword, setShowPassword] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  const password = useWatch({ control, name: 'password' });
  const confirm = useWatch({ control, name: 'confirm' });

  const mutation = useMutation({
    mutationFn: signUp,
    onSuccess: () => {
      void haptic('success');
      toast.show(t('signup.welcome'));
      router.replace(safeReturnTo(returnTo) as never);
    },
    onError: (error) => {
      void haptic('error');
      setEmailTaken(false);
      if (!(error instanceof ApiError)) {
        setBanner(t('signup.networkError'));
        return;
      }
      if (error.code === 'EMAIL_ALREADY_REGISTERED') {
        setEmailTaken(true);
        setError('email', { message: t('signup.emailTaken') });
        setFocus('email');
        return;
      }
      if (error.code === 'WEAK_PASSWORD') {
        setError('password', { message: weakPasswordMessage(error) });
        setFocus('password');
        return;
      }
      if (error.code === 'TERMS_OUTDATED') {
        setBanner(t('signup.termsOutdated'));
        return;
      }
      if (error.status === 429) {
        setBanner(t('signup.rateLimit'));
        return;
      }
      if (error.status === 400 && error.fields.length > 0) {
        const map: Record<string, keyof SignupForm> = { name: 'name', email: 'email', phone: 'phone', password: 'password' };
        for (const f of error.fields) {
          const name = map[f.field];
          if (name) setError(name, { message: f.message });
        }
        return;
      }
      // rede ou servidor: campos ficam; senha e confirmação limpam com a frase do design
      setBanner(t('signup.networkError'));
      setValue('password', '');
      setValue('confirm', '');
      setError('password', { message: t('password.retype') });
    },
  });

  const submit = handleSubmit(
    (values) => {
      setBanner(null);
      setEmailTaken(false);
      if (!online) {
        setBanner(t('signup.offline'));
        return;
      }
      mutation.mutate({ name: values.name, email: values.email, phone: values.phone, password: values.password });
    },
    () => void haptic('error'),
  );

  const passwordsEqual = confirm.length > 0 && confirm === password;

  return (
    <Screen
      footer={
        <Button
          label={t('signup.submit')}
          loading={mutation.isPending}
          loadingLabel={t('signup.submitting')}
          onPress={() => void submit()}
          size="lg"
          testID="auth.signup-submit"
        />
      }
      header={
        <Header
          right={<Button label={t('signup.haveAccount')} onPress={goLogin} testID="auth.go-login" variant="text" />}
          title={t('signup.title')}
        />
      }
    >
      <Text color="secondary">{context === 'checkout' ? t('signup.checkoutContext') : t('signup.context')}</Text>

      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="words"
            autoComplete="name"
            error={fieldState.error?.message}
            label={t('signup.name')}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => setFocus('email')}
            ref={field.ref}
            returnKeyType="next"
            testID="auth.signup-name-input"
            textContentType="name"
            value={field.value}
          />
        )}
      />

      <View style={styles.group}>
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
              label={t('signup.email')}
              onBlur={() => {
                field.onBlur();
                setSuggestion(suggestEmailDomain(field.value));
              }}
              onChangeText={(v) => {
                field.onChange(v);
                setEmailTaken(false);
                if (suggestion) setSuggestion(null);
              }}
              onSubmitEditing={() => setFocus('phone')}
              ref={field.ref}
              returnKeyType="next"
              testID="auth.signup-email-input"
              textContentType="emailAddress"
              value={field.value}
            />
          )}
        />
        {emailTaken ? (
          <Button
            label={t('signup.goLogin')}
            onPress={() => {
              setEmailPrefill(getValues('email'));
              goLogin();
            }}
            testID="auth.go-login-email-taken"
            variant="secondary"
          />
        ) : null}
        {suggestion ? (
          <View accessibilityLiveRegion="polite" style={styles.suggestion}>
            <Text>{t('signup.suggestion', { domain: suggestion })}</Text>
            <View style={styles.suggestionActions}>
              <Button
                label={t('signup.useSuggestion', { domain: suggestion })}
                onPress={() => {
                  const [local] = getValues('email').split('@');
                  setValue('email', `${local}@${suggestion}`, { shouldValidate: true });
                  setSuggestion(null);
                  void haptic('selection');
                }}
                testID="auth.signup-email-suggestion-accept"
                variant="secondary"
              />
              <Button label={t('signup.keepEmail')} onPress={() => setSuggestion(null)} testID="auth.signup-email-suggestion-keep" variant="text" />
            </View>
          </View>
        ) : null}
      </View>

      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="tel"
            error={fieldState.error?.message}
            keyboardType="phone-pad"
            label={t('signup.phone')}
            mask={maskPhone}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => setFocus('password')}
            placeholder="(11) 99999-9999"
            ref={field.ref}
            returnKeyType="next"
            testID="auth.signup-phone-input"
            textContentType="telephoneNumber"
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
            mode="new"
            onBlur={field.onBlur}
            onChangeText={(v) => {
              field.onChange(v);
              if (getValues('confirm').length === v.length) void trigger('confirm');
            }}
            onSubmitEditing={() => setFocus('confirm')}
            onToggleVisible={() => setShowPassword((v) => !v)}
            ref={field.ref}
            returnKeyType="next"
            showMeter
            testID="auth.password-input"
            value={field.value}
            visible={showPassword}
          />
        )}
      />

      <Controller
        control={control}
        name="confirm"
        render={({ field, fieldState }) => (
          <View style={styles.group}>
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
              testID="auth.password-confirm-input"
              value={field.value}
              visible={showPassword}
            />
            {passwordsEqual && !fieldState.error ? (
              <Text color="success" variant="caption">
                {t('password.match')}
              </Text>
            ) : null}
          </View>
        )}
      />

      <Text color="secondary" variant="caption">
        {t('signup.summary')}
      </Text>
      <Controller
        control={control}
        name="terms"
        render={({ field, fieldState }) => (
          <Checkbox
            checked={field.value}
            error={fieldState.error?.message}
            label={t('signup.terms', { terms: t('signup.termsLink'), privacy: t('signup.privacyLink') })}
            onChange={(v) => {
              field.onChange(v);
              field.onBlur();
            }}
            testID="auth.terms-checkbox"
          />
        )}
      />
      <View style={styles.links}>
        <Button label={t('signup.readTerms')} onPress={() => router.push('/legal/customer_terms')} testID="auth.terms-link" variant="text" />
        <Button label={t('signup.readPrivacy')} onPress={() => router.push('/legal/privacy')} testID="auth.privacy-link" variant="text" />
      </View>

      {banner ? <Banner testID="auth.signup-error" text={banner} tone="danger" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: theme.space[2] },
  suggestion: { gap: theme.space[2], backgroundColor: theme.color.feedback.info.subtle, borderRadius: theme.radius.md, padding: theme.space[3] },
  suggestionActions: { gap: theme.space[1] },
  links: { alignItems: 'flex-start' },
});
