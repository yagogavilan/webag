import type { CreateExchangeRequest, Exchange, ExchangeOptions, ExchangeStatus, ExchangeType } from '@webag/shared';
import { t, type MessageKey } from '../../i18n';
import { formatDateTime } from '../orders/model';

export type ReasonId = 'size' | 'color' | 'defect' | 'regret';
export type ExchangeItemOptions = NonNullable<ExchangeOptions['items'][number]>;

export const REASON_ORDER: readonly ReasonId[] = ['size', 'color', 'defect', 'regret'];

/** O tipo do contrato para cada motivo da tela. Tamanho e cor são o mesmo tipo (`size_color`) com `reasonCode` diferente. */
export const TYPE_BY_REASON: Record<ReasonId, ExchangeType> = { size: 'size_color', color: 'size_color', defect: 'defect', regret: 'withdrawal' };

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "25 nov" (identidade §8): data escrita, nunca DD/MM solto. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export interface ReasonState {
  eligible: boolean;
  deadline: string | null;
  /** Texto de por que está inerte (tocar explica, não dá erro). */
  blocked: string | null;
  pickupFeeCents: number;
}

const BLOCKED: Record<string, MessageKey> = {
  EXCHANGE_STORE_NO_VOLUNTARY: 'exchange.blockedStore',
  EXCHANGE_PRODUCT_NO_VOLUNTARY: 'exchange.blockedProduct',
  EXCHANGE_VOLUNTARY_LIMIT: 'exchange.blockedLimit',
  EXCHANGE_ALREADY_OPEN: 'exchange.blockedOpen',
  EXCHANGE_ITEM_ALREADY_EXCHANGED: 'exchange.blockedLimit',
};

export function reasonState(item: ExchangeItemOptions | undefined, reason: ReasonId): ReasonState {
  const opt = item?.options?.find((o) => o.type === TYPE_BY_REASON[reason]);
  if (!opt) return { eligible: false, deadline: null, blocked: t('exchange.blockedGeneric'), pickupFeeCents: 0 };
  const code = opt.reason?.code ?? '';
  const blocked = opt.eligible
    ? null
    : code === 'EXCHANGE_WINDOW_EXPIRED'
      ? t('exchange.blockedWindow', { date: opt.deadline ? formatDay(opt.deadline) : '' })
      : BLOCKED[code]
        ? t(BLOCKED[code] as MessageKey)
        : (opt.reason?.message ?? t('exchange.blockedGeneric'));
  return { eligible: Boolean(opt.eligible), deadline: opt.deadline ?? null, blocked, pickupFeeCents: opt.pickupFee?.amount ?? 0 };
}

export interface ExchangeDraft {
  orderItemId: string;
  reason: ReasonId;
  newVariantId: string | null;
  /** Defeito: "outro igual" (replace) ou dinheiro de volta (refund). Tamanho/cor sem estoque também vira refund. */
  prefer: 'replace' | 'refund';
  method: 'drop_at_store' | 'pickup_at_home';
  photoIds: string[];
  note: string;
}

export function buildExchangeRequest(d: ExchangeDraft): CreateExchangeRequest {
  const type = TYPE_BY_REASON[d.reason];
  const resolution = d.reason === 'regret' ? 'refund' : d.reason === 'defect' ? d.prefer : d.newVariantId ? 'replace' : 'refund';
  return {
    orderItemId: d.orderItemId,
    type,
    ...(d.reason === 'size' || d.reason === 'color' ? { reasonCode: d.reason } : {}),
    method: d.method,
    resolution,
    ...(d.reason !== 'regret' && d.reason !== 'defect' && d.newVariantId ? { newVariantId: d.newVariantId } : {}),
    ...(d.reason === 'defect' && d.prefer === 'replace' && d.newVariantId ? { newVariantId: d.newVariantId } : {}),
    ...(d.photoIds.length > 0 ? { photoIds: d.photoIds } : {}),
    ...(d.note.trim() ? { description: d.note.trim().slice(0, 300) } : {}),
  };
}

/** Falta algo? Devolve a seção e a mensagem (o botão nunca começa inerte: o erro aparece ao tocar, DS §6). */
export function firstMissing(d: Omit<Partial<ExchangeDraft>, 'reason'> & { reason: ReasonId | null }, variantsAvailable: boolean): { section: 'reason' | 'swap' | 'photos'; message: string } | null {
  if (!d.reason) return { section: 'reason', message: t('exchange.errReason') };
  if ((d.reason === 'size' || d.reason === 'color') && variantsAvailable && !d.newVariantId) return { section: 'swap', message: t('exchange.errSwap') };
  if (d.reason === 'defect' && (d.photoIds?.length ?? 0) < 1) return { section: 'photos', message: t('exchange.errPhoto') };
  return null;
}

// ---- Acompanhamento da troca ----

export const EXCHANGE_STEPS: readonly MessageKey[] = [
  'exchange.stepRequested',
  'exchange.stepAnalysis',
  'exchange.stepApproved',
  'exchange.stepReturn',
  'exchange.stepReceived',
  'exchange.stepResolution',
  'exchange.stepDone',
];

const REACHED: Record<ExchangeStatus, number> = {
  requested: 1,
  in_mediation: 1,
  awaiting_fee: 2,
  approved: 3,
  item_received: 4,
  completed: 6,
  rejected: 1,
  cancelled: 0,
  expired: 3,
};

export type ExchangeStepState = 'done' | 'current' | 'upcoming';
export interface ExchangeStep {
  label: string;
  state: ExchangeStepState;
}

export const isExchangeFailed = (s: ExchangeStatus): boolean => s === 'rejected' || s === 'cancelled' || s === 'expired';
export const isExchangeOpen = (s: ExchangeStatus): boolean => !isExchangeFailed(s) && s !== 'completed';

export function exchangeSteps(status: ExchangeStatus): ExchangeStep[] {
  const reached = REACHED[status];
  const failed = isExchangeFailed(status);
  return EXCHANGE_STEPS.map((key, i) => ({
    label: t(key),
    state: status === 'completed' || i < reached ? 'done' : i === reached && !failed ? 'current' : 'upcoming',
  }));
}

/** Próximo passo em uma frase (X2b). Os valores vêm do servidor (`totalDue`, `refund`): o app não soma. */
export function nextStepText(x: Pick<Exchange, 'status' | 'method' | 'answerDeadlineAt' | 'feeDueAt' | 'itemDueAt' | 'totalDue' | 'refund'>, money: (cents: number) => string): string {
  switch (x.status) {
    case 'requested':
      return t('exchange.nextRequested', { when: formatDateTime(x.answerDeadlineAt) });
    case 'awaiting_fee':
      return t('exchange.nextAwaitingFee', { total: money(x.totalDue.amount), when: x.feeDueAt ? formatDateTime(x.feeDueAt) : '' });
    case 'approved':
      return x.method === 'drop_at_store' ? t('exchange.nextApprovedStore', { when: x.itemDueAt ? formatDay(x.itemDueAt) : '' }) : t('exchange.nextApprovedPickup');
    case 'item_received':
      return t('exchange.nextReceived');
    case 'completed':
      return x.refund.amount > 0 ? t('exchange.nextRefund', { value: money(x.refund.amount) }) : t('exchange.nextCompleted');
    case 'rejected':
      return t('exchange.nextRejected');
    case 'cancelled':
      return t('exchange.nextCancelled');
    case 'expired':
      return t('exchange.nextExpired');
    case 'in_mediation':
      return t('exchange.nextMediation');
  }
}
