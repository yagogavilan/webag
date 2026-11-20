import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { fetchMe, saveProfile } from '../src/api/me-api';
import { ApiError } from '../src/api/problem';
import { sessionStore, useSession } from '../src/api/session';
import { AsyncBoundary } from '../src/components/AsyncBoundary';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { Header } from '../src/components/Header';
import { CheckCircle } from '../src/components/icons';
import { Screen } from '../src/components/Screen';
import { Skeleton } from '../src/components/Skeleton';
import { Text } from '../src/components/Text';
import { TextField } from '../src/components/TextField';
import { useToast } from '../src/components/Toast';
import { t } from '../src/i18n';
import { haptic } from '../src/lib/haptics';
import { isValidMobilePhone, maskPhone, onlyDigits } from '../src/lib/masks';
import { useOnline } from '../src/lib/useOnline';
import { theme } from '../src/theme';

const schema = z.object({
  name: z.string().trim().min(2, t('profile.nameError')).max(120, t('profile.nameError')),
  phone: z.string().refine(isValidMobilePhone, { message: t('profile.phoneError') }),
});
type ProfileForm = z.infer<typeof schema>;

/**
 * Meus dados (CC2): nome e celular editáveis; e-mail só leitura (trocar e-mail e senha pedem reautenticação e ficam para a próxima
 * entrega, docs/gestao/fila-mobile.md). Nada é salvo com dado inválido; salvar sem mudança diz "Nada mudou." e não chama a API.
 */
export default function ProfileScreen() {
  const session = useSession();
  const query = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => fetchMe(signal), enabled: session.status === 'authenticated', staleTime: 60_000 });
  const me = query.data;

  return (
    <Screen header={<Header title={t('profile.title')} />} testID="profile.screen">
      <AsyncBoundary
        isError={query.isError && !me}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
        skeleton={
          <View style={styles.form} testID="profile.skeleton">
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </View>
        }
      >
        {me ? <ProfileFormView email={me.email} emailVerified={me.emailVerified} name={me.name} phone={me.phone ?? ''} /> : null}
      </AsyncBoundary>
    </Screen>
  );
}

function ProfileFormView({ name, phone, email, emailVerified }: { name: string; phone: string; email: string; emailVerified: boolean }) {
  const toast = useToast();
  const online = useOnline();
  const client = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const initial = { name, phone: maskPhone(phone) };
  const { control, handleSubmit, reset, setError } = useForm<ProfileForm>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: initial });
  useEffect(() => reset({ name, phone: maskPhone(phone) }), [name, phone, reset]);

  const mutation = useMutation({
    mutationFn: (body: { name?: string; phone?: string }) => saveProfile(body),
    onSuccess: async (updated) => {
      void haptic('success');
      client.setQueryData(['me'], updated);
      await sessionStore.updateUser({ name: updated.name });
      setBanner(null);
      toast.show(t('profile.saved'));
    },
    onError: (error) => {
      void haptic('error');
      if (error instanceof ApiError && error.fields.length > 0) {
        for (const f of error.fields) if (f.field === 'name' || f.field === 'phone') setError(f.field, { message: f.message });
      }
      setBanner(t('profile.saveError'));
    },
  });

  const submit = handleSubmit(
    (values) => {
      setBanner(null);
      const nextName = values.name.trim();
      const changed: { name?: string; phone?: string } = {};
      if (nextName !== name) changed.name = nextName;
      if (onlyDigits(values.phone) !== onlyDigits(phone)) changed.phone = values.phone;
      if (Object.keys(changed).length === 0) {
        toast.show(t('profile.nothingChanged'));
        return;
      }
      if (!online) {
        setBanner(t('profile.offline'));
        return;
      }
      mutation.mutate(changed);
    },
    () => void haptic('error'),
  );

  return (
    <View style={styles.form}>
      {banner ? <Banner testID="profile.error" text={banner} tone="danger" /> : null}
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="words"
            autoComplete="name"
            error={fieldState.error?.message}
            label={t('profile.name')}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            testID="profile.name-input"
            textContentType="name"
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="tel"
            error={fieldState.error?.message}
            keyboardType="phone-pad"
            label={t('profile.phone')}
            mask={maskPhone}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            testID="profile.phone-input"
            textContentType="telephoneNumber"
            value={field.value}
          />
        )}
      />
      <View accessible accessibilityLabel={`${t('profile.emailReadonly')}: ${email}. ${emailVerified ? t('profile.emailVerified') : t('profile.emailPending')}`} style={styles.email} testID="profile.email">
        <Text variant="captionStrong">{t('profile.email')}</Text>
        <Text>{email}</Text>
        <View style={styles.badge}>
          {emailVerified ? <CheckCircle color={theme.color.feedback.success.base} size={theme.size.iconSm} weight="fill" /> : null}
          <Text color={emailVerified ? 'success' : 'secondary'} variant="caption">
            {emailVerified ? t('profile.emailVerified') : t('profile.emailPending')}
          </Text>
        </View>
      </View>
      <Button label={t('profile.save')} loading={mutation.isPending} onPress={() => void submit()} size="lg" testID="profile.save" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.space[4] },
  email: { gap: theme.space[1], backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.lg, padding: theme.space[4] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] },
});
