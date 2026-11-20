import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, StyleSheet, View } from 'react-native';
import { ApiError } from '../../api/problem';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { CheckCircle } from '../../components/icons';
import { OtpInput } from '../../components/OtpInput';
import { Text } from '../../components/Text';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { formatCountdown } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useCountdown } from '../../lib/useCountdown';
import { useOnline } from '../../lib/useOnline';
import { theme } from '../../theme';
import { classifyCodeError } from './errors';

/** `otp_reenvio_s` (parâmetro do negócio, valor padrão 60) e `otp_tentativas` (5). Ver onda-1b §E4. */
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const SUCCESS_PAUSE_MS = 400;

export interface OtpEntryProps {
  title: string;
  text: string;
  /** Verifica o código. Lança ApiError em falha. Nos fluxos em que o código só é conferido no passo final (reset) basta guardar e resolver. */
  onVerify: (code: string) => Promise<void>;
  /** Chamado após o check de sucesso (400 ms). */
  onDone: () => void;
  /** Pede outro código. Sem esta função não há reenvio (ex.: o chamador trata). */
  onResend?: () => Promise<void>;
  onChangeEmail?: () => void;
  /** Mostra "Enviando o código…" até o chamador confirmar o envio. */
  sending?: boolean;
  /** Falha vinda do chamador (ex.: código venceu no passo final do reset). */
  externalMessage?: string | undefined;
}

/** Tela de código por e-mail (E4), compartilhada por cadastro, reset e step-up. Verifica sozinha no 6º dígito. */
export function OtpEntry({ title, text, onVerify, onDone, onResend, onChangeEmail, sending, externalMessage }: OtpEntryProps) {
  const toast = useToast();
  const online = useOnline();
  const { remaining, restart } = useCountdown(RESEND_SECONDS);
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState<string | undefined>(externalMessage);
  const [exhausted, setExhausted] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);
  const attempts = useRef(0);
  const busy = useRef(false);

  // anuncia "pode reenviar" uma vez, quando a contagem acaba (não a cada segundo)
  useEffect(() => {
    if (remaining === 0) AccessibilityInfo.announceForAccessibility(t('otp.resendA11yReady'));
  }, [remaining]);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onDone, SUCCESS_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [done, onDone]);

  const verify = async (value: string) => {
    if (busy.current || exhausted) return;
    if (!online) {
      setErrorText(t('otp.offline'));
      return;
    }
    busy.current = true;
    setVerifying(true);
    setErrorText(undefined);
    try {
      await onVerify(value);
      void haptic('success');
      setDone(true);
    } catch (error) {
      void haptic('error');
      const kind = classifyCodeError(error);
      if (kind === 'invalid') {
        attempts.current += 1;
        const left = MAX_ATTEMPTS - attempts.current;
        if (left <= 0) {
          setExhausted(true);
          setErrorText(t('otp.tooMany'));
        } else {
          setErrorText(left === 1 ? t('otp.wrongLast') : t('otp.wrong', { left }));
        }
        setCode('');
      } else if (kind === 'expired') {
        setErrorText(t('otp.expired'));
        setCode('');
      } else if (kind === 'rate') {
        setExhausted(true);
        setErrorText(t('otp.tooMany'));
        setCode('');
      } else {
        setErrorText(t('otp.network'));
      }
    } finally {
      busy.current = false;
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!onResend) return;
    try {
      await onResend();
      attempts.current = 0;
      setExhausted(false);
      setCode('');
      setErrorText(undefined);
      restart(RESEND_SECONDS);
      toast.show(t('otp.sent'));
    } catch (error) {
      void haptic('error');
      if (error instanceof ApiError && error.status === 429) setErrorText(t('otp.tooManyResends'));
      else setErrorText(t('otp.network'));
    }
  };

  if (done) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.done} testID="auth.otp-done">
        <CheckCircle color={theme.color.feedback.success.base} size={theme.size.iconLg} weight="fill" />
        <Text variant="title2">{t('otp.verified')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text variant="title1">{title}</Text>
      <Text color="secondary">{text}</Text>
      <OtpInput
        disabled={exhausted}
        hasError={Boolean(errorText)}
        onChange={setCode}
        onComplete={(value) => void verify(value)}
        value={code}
      />
      {sending ? (
        <Text color="secondary" style={styles.center} variant="caption">
          {t('otp.sending')}
        </Text>
      ) : verifying ? (
        <Text color="secondary" style={styles.center} variant="caption">
          {t('otp.verifying')}
        </Text>
      ) : (
        <Text color="secondary" style={styles.center} variant="caption">
          {t('otp.validFor')}
        </Text>
      )}
      {errorText ? <Banner testID="auth.otp-error" text={errorText} tone="danger" /> : null}
      {exhausted && onResend ? (
        <Button label={t('otp.sendNew')} onPress={() => void resend()} testID="auth.otp-send-new" />
      ) : null}
      {onResend && !exhausted ? (
        remaining > 0 ? (
          // contagem só visual: o leitor de tela é avisado ao liberar, não a cada segundo
          <Text
            accessibilityElementsHidden
            color="secondary"
            importantForAccessibility="no-hide-descendants"
            style={styles.center}
            testID="auth.otp-countdown"
          >
            {t('otp.resendIn', { time: formatCountdown(remaining) })}
          </Text>
        ) : (
          <Button label={t('otp.resend')} onPress={() => void resend()} testID="auth.otp-resend" variant="text" />
        )
      ) : null}
      <Button label={t('otp.openMail')} onPress={() => void openMailApp()} testID="auth.otp-open-mail" variant="secondary" />
      {onChangeEmail ? <Button label={t('otp.changeEmail')} onPress={onChangeEmail} testID="auth.otp-change-email" variant="text" /> : null}
    </View>
  );
}

/** Abre o app de e-mail do sistema (a caixa de entrada, não um rascunho novo). */
async function openMailApp(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Linking.openURL('intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end');
    } else {
      await Linking.openURL('message://');
    }
  } catch {
    try {
      await Linking.openURL('mailto:');
    } catch {
      // sem app de e-mail instalado: o usuário abre por conta própria
    }
  }
}

const styles = StyleSheet.create({
  wrapper: { gap: theme.space[4] },
  center: { textAlign: 'center' },
  done: { alignItems: 'center', gap: theme.space[3], paddingVertical: theme.space[10] },
});
