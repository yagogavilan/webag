import { StyleSheet, View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { deliveryEta, type EtaLike } from '../catalog/eta';

const range = (eta: EtaLike | null | undefined): string | null => {
  if (!eta) return null;
  const w = deliveryEta({ etaMinMinutes: 0, etaMaxMinutes: 0, eta });
  return w ? `${w.start} – ${w.end}` : null;
};

export interface EtaChangedSheetProps {
  visible: boolean;
  /** A faixa que o cliente viu na sacola. */
  before: EtaLike | null;
  /** A faixa nova que o servidor calculou (409 `ETA_CHANGED`). */
  after: EtaLike | null;
  accepting: boolean;
  onAccept: () => void;
  onBack: () => void;
}

/**
 * "O horário mudou" (onda-7-eta-atraso.md §3.2, WB-261): o fim da faixa piorou entre a sacola e o pedido e NENHUM pedido foi criado.
 * Mostra antes e agora lado a lado; "Continuar" só atualiza a sacola com a faixa nova (quem toca em Pagar é o cliente, que já viu o
 * horário). O app nunca calcula a faixa: o que aparece é o que o servidor mandou.
 */
export function EtaChangedSheet({ visible, before, after, accepting, onAccept, onBack }: EtaChangedSheetProps) {
  const was = range(before);
  const now = range(after);
  return (
    <BottomSheet
      footer={
        <>
          <Button label={t('etaChanged.accept')} loading={accepting} loadingLabel={t('common.loading')} onPress={onAccept} size="lg" testID="cart.eta-changed-accept" />
          <Button label={t('etaChanged.back')} onPress={onBack} testID="cart.eta-changed-back" variant="secondary" />
        </>
      }
      hideClose
      onClose={onBack}
      testID="cart.eta-changed-sheet"
      title={t('etaChanged.title')}
      visible={visible}
    >
      <Text color="secondary">{t('etaChanged.text')}</Text>
      {now ? (
        <View accessible accessibilityLabel={was ? t('etaChanged.a11y', { before: was, after: now }) : `${t('etaChanged.now')} ${now}`} style={styles.compare}>
          {was ? (
            <View style={styles.block}>
              <Text color="secondary" variant="caption">{t('etaChanged.before')}</Text>
              <Text color="secondary" style={styles.struck} variant="title2">{was}</Text>
            </View>
          ) : null}
          <View style={[styles.block, styles.after]}>
            <Text style={styles.onInk} variant="caption">{t('etaChanged.now')}</Text>
            <Text style={styles.onInk} testID="cart.eta-changed-new" variant="title2">{now}</Text>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  compare: { flexDirection: 'row', gap: theme.space[2] },
  block: { flex: 1, gap: theme.space[1], borderRadius: theme.radius.lg, padding: theme.space[3], backgroundColor: theme.color.surface.sunken },
  after: { backgroundColor: theme.color.surface.ink },
  struck: { textDecorationLine: 'line-through' },
  onInk: { color: theme.color.neutral[0] },
});
