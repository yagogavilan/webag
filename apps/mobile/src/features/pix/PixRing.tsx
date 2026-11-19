import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../../theme';
import { Text } from '../../components/Text';
import { Clock, Warning } from '../../components/icons';
import { formatCountdown } from '../../lib/format';
import { t } from '../../i18n';
import { PIX_ALERT_SECONDS } from '../checkout/config';

export const PIX_TOTAL_SECONDS = 15 * 60;
const SIZE = 144;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const LENGTH = 2 * Math.PI * RADIUS;

/**
 * Anel que esvazia com o tempo e o relógio dentro (direção v2). Atualiza 1 vez por segundo (sem animação contínua: barato em Android
 * de entrada e respeita "reduzir movimento"). Abaixo de 2 min: ícone e texto de alerta, nunca só cor.
 */
export function PixRing({ seconds }: { seconds: number }) {
  const low = seconds <= PIX_ALERT_SECONDS;
  const fraction = Math.min(1, seconds / PIX_TOTAL_SECONDS);
  const color = low ? theme.color.feedback.warning.base : theme.color.action.primary;
  const Icon = low ? Warning : Clock;
  return (
    <View style={styles.wrap}>
      <View accessible accessibilityLabel={t('pix.expiresIn', { time: formatCountdown(seconds) })} style={styles.ring} testID="pix.countdown">
        <Svg height={SIZE} style={styles.svg} width={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} fill="none" r={RADIUS} stroke={theme.color.brand[100]} strokeWidth={STROKE} />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            fill="none"
            r={RADIUS}
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
            stroke={color}
            strokeDasharray={`${LENGTH * fraction} ${LENGTH}`}
            strokeLinecap="round"
            strokeWidth={STROKE}
          />
        </Svg>
        <Icon color={color} size={theme.size.iconMd} weight="bold" />
        <Text style={{ color: low ? theme.color.text.warning : theme.color.text.primary }} variant="numeral">
          {formatCountdown(seconds)}
        </Text>
      </View>
      <Text color={low ? 'warning' : 'secondary'} variant="captionStrong">
        {low ? t('pix.expiresSoon', { time: formatCountdown(seconds) }) : t('pix.expiresIn', { time: formatCountdown(seconds) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: theme.space[2] },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
});
