import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { fetchHelp } from '../src/api/privacy-api';
import { Button } from '../src/components/Button';
import { Header } from '../src/components/Header';
import { CaretDown, CaretUp, MagnifyingGlass, WhatsappLogo } from '../src/components/icons';
import { Screen } from '../src/components/Screen';
import { Skeleton } from '../src/components/Skeleton';
import { EmptyState, ErrorState } from '../src/components/StateViews';
import { Text } from '../src/components/Text';
import { openMailto } from '../src/features/legal/open-link';
import { openWhatsapp } from '../src/features/orders/links';
import { Pressy } from '../src/motion';
import { t } from '../src/i18n';
import { useOnline } from '../src/lib/useOnline';
import { theme } from '../src/theme';

/** Abre o WhatsApp com a mensagem pronta; sem o app, cai no e-mail com o mesmo texto (AJ1 C2). */
async function contact(whatsapp: string | null, email: string | null, message: string): Promise<void> {
  // Só abre o que passa pelo helper (wa.me com número válido; e-mail simples): o número e o e-mail vêm da API (SEC-172).
  if (whatsapp && (await openWhatsapp(whatsapp, message))) return;
  if (email) await openMailto(email, message);
}

/** AJ1. Ajuda do cliente (WB-034): contato em 2 toques, busca e perguntas por grupo (acordeão). Pública (visitante usa). */
export default function HelpScreen() {
  const router = useRouter();
  const online = useOnline();
  const { order } = useLocalSearchParams<{ order?: string }>();
  const query = useQuery({ queryKey: ['help', 'customer'], queryFn: ({ signal }) => fetchHelp(signal), staleTime: 5 * 60_000 });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const data = query.data;
  const message = order ? t('help.orderMessage', { n: order }) : t('help.whatsappShort');

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.groups ?? [])
      .map((g) => ({ ...g, items: g.items.filter((i) => !needle || i.question.toLowerCase().includes(needle) || i.answer.toLowerCase().includes(needle)) }))
      .filter((g) => g.items.length > 0);
  }, [data, q]);

  const header = <Header title={t('help.title')} />;

  if (query.isLoading) {
    return (
      <Screen header={header} testID="help.skeleton">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton height={56} key={i} />
        ))}
      </Screen>
    );
  }
  if (query.isError && !data) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="help.error" text={online ? t('states.errorText') : t('help.offline')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  const whatsapp = data?.contacts.whatsapp ?? null;
  const email = data?.contacts.email ?? null;

  return (
    <Screen header={header} testID="help.screen">
      <Text accessibilityRole="header" variant="poster">
        {t('help.title')}
      </Text>
      <View style={styles.contact}>
        {whatsapp || email ? (
          <>
            {whatsapp ? (
              <Button
                accessibilityLabel={t('help.whatsapp')}
                icon={<WhatsappLogo color={theme.color.neutral[0]} size={22} />}
                label={t('help.whatsappShort')}
                onPress={() => void contact(whatsapp, email, message)}
                size="lg"
                testID="help.contact-whatsapp"
              />
            ) : null}
            {email ? <Button label={t('help.mail')} onPress={() => void openMailto(email)} testID="help.contact-mail" variant="secondary" /> : null}
            {data?.contacts.hours ? (
              <Text color="secondary" variant="caption">
                {t('help.hours', { hours: data.contacts.hours })}
              </Text>
            ) : null}
            {!online ? <Text color="warning" variant="caption">{t('help.offline')}</Text> : null}
          </>
        ) : (
          <Text color="secondary">{t('help.noContact')}</Text>
        )}
      </View>

      <View style={styles.search}>
        <MagnifyingGlass color={theme.color.text.secondary} size={22} />
        <TextInput
          accessibilityLabel={t('help.search')}
          maxFontSizeMultiplier={theme.maxFont.default}
          onChangeText={setQ}
          placeholder={t('help.search')}
          placeholderTextColor={theme.color.text.secondary}
          style={styles.input}
          testID="help.search"
          value={q}
        />
      </View>

      {groups.length === 0 ? (
        <EmptyState actionLabel={whatsapp ? t('help.whatsappShort') : undefined} art="search" onAction={whatsapp ? () => void contact(whatsapp, email, message) : undefined} testID="help.empty" text={t('help.emptyText')} title={t('help.emptyTitle', { q })} />
      ) : (
        groups.map((g) => (
          <View key={g.id} style={styles.group} testID={`help.group-${g.id}`}>
            <Text accessibilityRole="header" variant="title1">
              {g.label}
            </Text>
            {g.items.map((item) => {
              const expanded = open === item.id;
              return (
                <View key={item.id} style={styles.faq}>
                  <Pressy
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => setOpen(expanded ? null : item.id)}
                    pressedScale={0.99}
                    style={styles.question}
                    testID={`help.faq-${item.id}`}
                  >
                    <Text style={styles.flex} variant="bodyStrong">
                      {item.question}
                    </Text>
                    {expanded ? <CaretUp color={theme.color.text.secondary} size={20} /> : <CaretDown color={theme.color.text.secondary} size={20} />}
                  </Pressy>
                  {/* Texto puro: a resposta é do admin e nunca é interpretada como HTML */}
                  {expanded ? <Text color="secondary">{item.answer}</Text> : null}
                </View>
              );
            })}
          </View>
        ))
      )}

      <View style={styles.links}>
        <Button label={t('help.terms')} onPress={() => router.push('/legal/customer_terms')} testID="help.terms" variant="text" />
        <Button label={t('help.policy')} onPress={() => router.push('/legal/privacy')} testID="help.policy" variant="text" />
        <Button label={t('help.privacy')} onPress={() => router.push('/privacy' as never)} testID="help.privacy" variant="text" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contact: { gap: theme.space[2], backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.card, padding: theme.space[4] },
  search: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.space[2], borderWidth: theme.borderWidth.strong, borderColor: theme.color.border.strong, borderRadius: theme.radius.button, paddingHorizontal: theme.space[3], backgroundColor: theme.color.surface.card },
  input: { flex: 1, minHeight: 48, fontFamily: theme.text.body.fontFamily, fontSize: theme.text.body.fontSize, color: theme.color.text.primary },
  group: { gap: theme.space[2] },
  faq: { gap: theme.space[2], borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.subtle, paddingBottom: theme.space[2] },
  question: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.space[2] },
  flex: { flex: 1 },
  links: { paddingTop: theme.space[3] },
});
