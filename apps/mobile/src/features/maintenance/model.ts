import type { MaintenanceStatus } from '@webag/shared';
import { t } from '../../i18n';

/** O aviso só existe com a manutenção ligada. Resposta estranha ou falha de rede = sem aviso (o app nunca inventa manutenção). */
export const isMaintenanceOn = (status: Partial<MaintenanceStatus> | null | undefined): status is MaintenanceStatus => Boolean(status && status.active === true);

const hourLabel = (d: Date): string => {
  const m = d.getMinutes();
  return m === 0 ? `${d.getHours()}h` : `${d.getHours()}h${String(m).padStart(2, '0')}`;
};
const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "hoje às 14h30" / "amanhã às 9h" / "20/11 às 9h"; sem previsão ou inválida: null. A previsão é só informativa. */
export function expectedBackLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  if (sameDay(at, now)) return `hoje às ${hourLabel(at)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(at, tomorrow)) return `amanhã às ${hourLabel(at)}`;
  return `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')} às ${hourLabel(at)}`;
}

/** Texto do aviso: a mensagem da Webag (ou o padrão) + a previsão, quando houver. */
export function maintenanceText(message: string | null | undefined, expectedBackAt: string | null | undefined, now: Date = new Date()): string {
  const base = message?.trim() || t('maintenance.fallback');
  const when = expectedBackLabel(expectedBackAt, now);
  return when ? `${base} ${t('maintenance.backAt', { when })}` : base;
}
