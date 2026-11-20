import type { MaintenanceStatus } from '@webag/shared';
import { formatClock, formatDateTime } from './format';

export type { MaintenanceStatus };

export const MAINTENANCE_TITLE = 'Voltamos já';
/** Texto de reserva quando a API não manda mensagem (ela manda o padrão, mas o aviso nunca fica sem texto). */
export const MAINTENANCE_FALLBACK = 'Estamos em manutenção para melhorar o Webag. Pedidos novos voltam em breve.';

/** O aviso só existe com a manutenção ligada. Resposta estranha ou falha de rede = sem aviso (não inventamos manutenção). */
export function isMaintenanceOn(status: Partial<MaintenanceStatus> | null | undefined): status is MaintenanceStatus {
  return Boolean(status && status.active === true);
}

/** "Previsão de volta: hoje às 14:30" / "Previsão de volta: 20 nov, 08:00". A previsão é informativa: a manutenção não desliga sozinha. */
export function expectedBackText(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const sameDay = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(at) === new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(now);
  return `Previsão de volta: ${sameDay ? `hoje às ${formatClock(at)}` : formatDateTime(at)}.`;
}

export function maintenanceText(status: MaintenanceStatus): string {
  return status.message?.trim() || MAINTENANCE_FALLBACK;
}
