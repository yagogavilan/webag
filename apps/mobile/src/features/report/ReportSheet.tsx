import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { sendReport } from '../../api/privacy-api';
import { ApiError } from '../../api/problem';
import { useSession } from '../../api/session';
import { Banner } from '../../components/Banner';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { CheckCircle, Flag } from '../../components/icons';
import { RadioListItem } from '../../components/RadioListItem';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { haptic } from '../../lib/haptics';
import { useOnline } from '../../lib/useOnline';
import { Pressy } from '../../motion';
import { theme } from '../../theme';

export type ReportTarget = 'review' | 'product' | 'store';
type Reason = 'offensive' | 'false' | 'prohibited' | 'scam' | 'other';

const REASONS: Record<ReportTarget, readonly Reason[]> = {
  review: ['offensive', 'false', 'scam', 'other'],
  product: ['offensive', 'false', 'prohibited', 'scam', 'other'],
  store: ['offensive', 'false', 'prohibited', 'scam', 'other'],
};
const TITLES = { review: 'report.titleReview', product: 'report.titleProduct', store: 'report.titleStore' } as const;

/**
 * DN1. Denunciar avaliação, produto ou loja (exigência das lojas de apps, WB-038). Folha em 3 toques: motivo, texto opcional, enviar.
 * A resposta é sempre "Recebemos. Vamos analisar.", também na repetição (o servidor não diz que já existia). Visitante vai entrar primeiro.
 */
export function ReportSheet({ target, targetId, visible, onClose }: { target: ReportTarget; targetId: string; visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const online = useOnline();
  const session = useSession();
  const [reason, setReason] = useState<Reason | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    onClose();
    // zera depois de fechar: um novo toque começa limpo
    setTimeout(() => {
      setDone(false);
      setReason(null);
      setText('');
      setError(null);
    }, 300);
  };

  const submit = async () => {
    if (busy) return;
    if (session.status !== 'authenticated') {
      onClose();
      router.push({ pathname: '/login', params: { returnTo: '/' } });
      return;
    }
    if (!reason) {
      void haptic('error');
      setError(t('report.chooseReason'));
      return;
    }
    if (!online) {
      setError(t('report.offline'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendReport({ targetType: target, targetId, reason, ...(text.trim() ? { text: text.trim() } : {}) });
      void haptic('success');
      setDone(true);
    } catch (e) {
      void haptic('error');
      setError(e instanceof ApiError && e.status === 403 ? t('report.cantReportOwn') : e instanceof ApiError && e.isConnectivity ? t('report.offline') : t('report.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet onClose={close} testID="report.sheet" title={t(TITLES[target])} visible={visible}>
      {done ? (
        <View accessibilityLiveRegion="polite" style={styles.done} testID="report.done">
          <CheckCircle color={theme.color.feedback.success.base} duo={theme.color.feedback.success.border} size={56} weight="duotone" />
          <Text variant="title1">{t('report.done')}</Text>
          <Button label={t('common.close')} onPress={close} size="lg" />
        </View>
      ) : (
        <View style={styles.form}>
          <Text variant="captionStrong">{t('report.reason')}</Text>
          <View accessibilityRole="radiogroup" style={styles.group}>
            {REASONS[target].map((r) => (
              <RadioListItem
                key={r}
                onPress={() => {
                  setReason(r);
                  setError(null);
                }}
                selected={reason === r}
                testID={`report.reason-${r}`}
                title={t(`report.${r}` as const)}
              />
            ))}
          </View>
          <Text color="secondary" variant="captionStrong">
            {t('report.text')}
          </Text>
          <TextInput accessibilityLabel={t('report.text')} maxLength={200} multiline onChangeText={setText} style={styles.input} testID="report.text" value={text} />
          <Text color="secondary" style={styles.counter} variant="caption">
            {text.length}/200
          </Text>
          {error ? <Banner testID="report.error" text={error} tone="danger" /> : null}
          <Button label={session.status === 'authenticated' ? t('report.submit') : t('report.login')} loading={busy} onPress={() => void submit()} size="lg" testID="report.submit" />
        </View>
      )}
    </BottomSheet>
  );
}

/** Botão discreto "Denunciar" que abre a folha (produto, loja e avaliação). Alvo ≥ 44. */
export function ReportButton({ target, targetId, label = t('report.open'), subject, testID }: { target: ReportTarget; targetId: string; label?: string; subject?: string; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressy accessibilityLabel={subject ? `${label}, ${subject}` : label} accessibilityRole="button" feedback="selection" onPress={() => setOpen(true)} style={styles.button} testID={testID ?? `report.open-${targetId}`}>
        <Flag color={theme.color.text.secondary} size={18} />
        <Text color="secondary" variant="captionStrong">
          {label}
        </Text>
      </Pressy>
      <ReportSheet onClose={() => setOpen(false)} target={target} targetId={targetId} visible={open} />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.space[3] },
  group: { gap: theme.space[2] },
  done: { alignItems: 'flex-start', gap: theme.space[3], paddingVertical: theme.space[2] },
  input: { minHeight: 80, borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.strong, borderRadius: theme.radius.control, padding: theme.space[3], textAlignVertical: 'top', color: theme.color.text.primary, backgroundColor: theme.color.surface.card, ...theme.text.body },
  counter: { alignSelf: 'flex-end', marginTop: -theme.space[2] },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: theme.space[1] },
});
